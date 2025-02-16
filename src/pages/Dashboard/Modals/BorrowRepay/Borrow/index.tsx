/** @jsxImportSource @emotion/react */
import BigNumber from 'bignumber.js';
import {
  ConnectWallet,
  EnableToken,
  FormikSubmitButton,
  FormikTokenTextField,
  NoticeWarning,
} from 'components';
import { VError } from 'errors';
import React from 'react';
import { useTranslation } from 'translation';
import { Asset } from 'types';
import {
  convertTokensToWei,
  formatToReadablePercentage,
  formatTokensToReadableValue,
  unsafelyGetToken,
  unsafelyGetOToken,
} from 'utilities';
import type { TransactionReceipt } from 'web3-core/types';

import { useBorrowOToken, useGetUserMarketInfo } from 'clients/api';
import { SAFE_BORROW_LIMIT_PERCENTAGE } from 'constants/safeBorrowLimitPercentage';
import { TOKENS } from 'constants/tokens';
import { AmountForm, AmountFormProps, ErrorCode } from 'containers/AmountForm';
import { AuthContext } from 'context/AuthContext';
import useHandleTransactionMutation from 'hooks/useHandleTransactionMutation';

import { useStyles } from '../../styles';
import AccountData from '../AccountData';
import TEST_IDS from './testIds';

export interface BorrowFormProps {
  asset: Asset;
  limitTokens: string;
  safeBorrowLimitPercentage: number;
  safeLimitTokens: string;
  borrow: (amountWei: BigNumber) => Promise<TransactionReceipt>;
  isBorrowLoading: boolean;
  isXcnEnabled: boolean;
  hasUserCollateralizedSuppliedAssets: boolean;
}

export const BorrowForm: React.FC<BorrowFormProps> = ({
  asset,
  limitTokens,
  safeBorrowLimitPercentage,
  safeLimitTokens,
  borrow,
  isXcnEnabled,
  isBorrowLoading,
  hasUserCollateralizedSuppliedAssets,
}) => {
  const { t, Trans } = useTranslation();
  const sharedStyles = useStyles();

  const handleTransactionMutation = useHandleTransactionMutation();

  const readableTokenBorrowableAmount = React.useMemo(
    () =>
      formatTokensToReadableValue({
        value: new BigNumber(limitTokens),
        token: asset.token,
      }),
    [limitTokens],
  );

  const onSubmit: AmountFormProps['onSubmit'] = async amountTokens => {
    const formattedAmountTokens = new BigNumber(amountTokens);

    const amountWei = convertTokensToWei({
      value: formattedAmountTokens,
      token: asset.token,
    });

    return handleTransactionMutation({
      mutate: () => borrow(amountWei),
      successTransactionModalProps: transactionReceipt => ({
        title: t('borrowRepayModal.borrow.successfulTransactionModal.title'),
        content: t('borrowRepayModal.borrow.successfulTransactionModal.message'),
        amount: {
          valueWei: amountWei,
          token: asset.token,
        },
        transactionHash: transactionReceipt.transactionHash,
      }),
    });
  };

  return (
    <AmountForm onSubmit={onSubmit} maxAmount={limitTokens}>
      {({ values, dirty, isValid, errors }) => (
        <>
          <div css={[sharedStyles.getRow({ isLast: true })]}>
            <FormikTokenTextField
              name="amount"
              token={asset.token}
              disabled={isBorrowLoading || !hasUserCollateralizedSuppliedAssets}
              rightMaxButton={{
                label: t('borrowRepayModal.borrow.rightMaxButtonLabel', {
                  limitPercentage: safeBorrowLimitPercentage,
                }),
                valueOnClick: safeLimitTokens,
              }}
              data-testid={TEST_IDS.tokenTextField}
              // Only display error state if amount is higher than borrow limit
              hasError={errors.amount === ErrorCode.HIGHER_THAN_MAX}
              description={
                <Trans
                  i18nKey="borrowRepayModal.borrow.borrowableAmount"
                  components={{
                    White: <span css={sharedStyles.whiteLabel} />,
                  }}
                  values={{ amount: readableTokenBorrowableAmount }}
                />
              }
            />

            {(!hasUserCollateralizedSuppliedAssets || +values.amount > +safeLimitTokens) && (
              <NoticeWarning
                css={sharedStyles.notice}
                description={
                  +values.amount > +safeLimitTokens
                    ? t('borrowRepayModal.borrow.highAmountWarning')
                    : t('borrowRepayModal.borrow.noCollateralizedSuppliedAssetWarning', {
                        tokenSymbol: asset.token.symbol,
                      })
                }
              />
            )}
          </div>

          <AccountData
            hypotheticalBorrowAmountTokens={+values.amount}
            asset={asset}
            isXcnEnabled={isXcnEnabled}
          />

          <FormikSubmitButton
            loading={isBorrowLoading}
            disabled={!isValid || !dirty || isBorrowLoading || !hasUserCollateralizedSuppliedAssets}
            fullWidth
            enabledLabel={t('borrowRepayModal.borrow.submitButton')}
            disabledLabel={t('borrowRepayModal.borrow.submitButtonDisabled')}
          />
        </>
      )}
    </AmountForm>
  );
};

export interface BorrowProps {
  asset: Asset;
  isXcnEnabled: boolean;
  onClose: () => void;
}

const Borrow: React.FC<BorrowProps> = ({ asset, onClose, isXcnEnabled }) => {
  const { t } = useTranslation();
  const { account } = React.useContext(AuthContext);

  const oEthTokenContractAddress = unsafelyGetOToken(asset.token.id).address;

  // TODO: handle loading state (see https://app.clickup.com/t/2d4rcee)
  const {
    data: { userTotalBorrowBalanceCents, userTotalBorrowLimitCents, assets },
  } = useGetUserMarketInfo({
    accountAddress: account?.address,
  });

  const hasUserCollateralizedSuppliedAssets = React.useMemo(
    () =>
      assets.some(userAsset => userAsset.collateral && userAsset.supplyBalance.isGreaterThan(0)),
    [JSON.stringify(assets)],
  );

  const { mutateAsync: borrow, isLoading: isBorrowLoading } = useBorrowOToken({
    oTokenId: asset.token.id,
  });

  const handleBorrow: BorrowFormProps['borrow'] = async amountWei => {
    if (!account?.address) {
      throw new VError({ type: 'unexpected', code: 'walletNotConnected' });
    }
    const res = await borrow({
      amountWei,
      fromAccountAddress: account.address,
    });
    // Close modal on success
    onClose();
    return res;
  };

  // Calculate maximum and safe maximum amount of tokens user can borrow
  const [limitTokens, safeLimitTokens] = React.useMemo(() => {
    // Return 0 values if borrow limit has been reached
    if (userTotalBorrowBalanceCents.isGreaterThanOrEqualTo(userTotalBorrowLimitCents)) {
      return ['0', '0'];
    }

    const marginWithBorrowLimitDollars = userTotalBorrowLimitCents
      .minus(userTotalBorrowBalanceCents)
      // Convert cents to dollars
      .dividedBy(100);
    const maxTokens = BigNumber.minimum(asset.liquidity, marginWithBorrowLimitDollars)
      // Convert dollars to tokens
      .dividedBy(asset.tokenPrice);

    const safeBorrowLimitCents = userTotalBorrowLimitCents.multipliedBy(
      SAFE_BORROW_LIMIT_PERCENTAGE / 100,
    );
    const marginWithSafeBorrowLimitDollars = safeBorrowLimitCents
      .minus(userTotalBorrowBalanceCents)
      // Convert cents to dollars
      .dividedBy(100);

    const safeMaxTokens = userTotalBorrowBalanceCents.isLessThan(safeBorrowLimitCents)
      ? // Convert dollars to tokens
        marginWithSafeBorrowLimitDollars.dividedBy(asset.tokenPrice)
      : new BigNumber(0);

    const tokenDecimals = unsafelyGetToken(asset.token.id).decimals;
    const formatValue = (value: BigNumber) =>
      value.dp(tokenDecimals, BigNumber.ROUND_DOWN).toFixed();

    return [formatValue(maxTokens), formatValue(safeMaxTokens)];
  }, [
    asset.token.id,
    asset.tokenPrice,
    asset.liquidity,
    userTotalBorrowLimitCents.toFixed(),
    userTotalBorrowBalanceCents.toFixed(),
  ]);

  return (
    <ConnectWallet message={t('borrowRepayModal.borrow.connectWalletMessage')}>
      {asset && (
        <EnableToken
          token={asset.token}
          spenderAddress={oEthTokenContractAddress}
          title={t('borrowRepayModal.borrow.enableToken.title', { symbol: asset.token.symbol })}
          tokenInfo={[
            {
              label: t('borrowRepayModal.borrow.enableToken.borrowInfo'),
              iconSrc: asset.token,
              children: formatToReadablePercentage(asset.borrowApy),
            },
            {
              label: t('borrowRepayModal.borrow.enableToken.distributionInfo'),
              iconSrc: TOKENS.xcn,
              children: formatToReadablePercentage(asset.xcnBorrowApy),
            },
          ]}
        >
          <BorrowForm
            asset={asset}
            isXcnEnabled={isXcnEnabled}
            limitTokens={limitTokens}
            safeBorrowLimitPercentage={SAFE_BORROW_LIMIT_PERCENTAGE}
            safeLimitTokens={safeLimitTokens}
            borrow={handleBorrow}
            isBorrowLoading={isBorrowLoading}
            hasUserCollateralizedSuppliedAssets={hasUserCollateralizedSuppliedAssets}
          />
        </EnableToken>
      )}
    </ConnectWallet>
  );
};

export default Borrow;
