/** @jsxImportSource @emotion/react */
import { Typography } from '@mui/material';
import Paper from '@mui/material/Paper';
import BigNumber from 'bignumber.js';
import {
  ConnectWallet,
  Icon,
  LabeledInlineContent,
  SelectTokenTextField,
  TertiaryButton,
  toast,
} from 'components';
import config from 'config';
import { VError } from 'errors';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'translation';
import { Swap, TokenBalance } from 'types';
import { convertWeiToTokens, formatToReadablePercentage } from 'utilities';
import type { TransactionReceipt } from 'web3-core/types';

import { useSwapTokens } from 'clients/api';
import { SLIPPAGE_TOLERANCE_PERCENTAGE } from 'constants/swap';
import {
  MAINNET_UNISWAP_TOKENS,
  UNISWAP_TOKENS,
  TESTNET_UNISWAP_TOKENS,
} from 'constants/tokens';
import { AuthContext } from 'context/AuthContext';
import useConvertWeiToReadableTokenString from 'hooks/useConvertWeiToReadableTokenString';
import useGetSwapTokenUserBalances from 'hooks/useGetSwapTokenUserBalances';
import useSuccessfulTransactionModal from 'hooks/useSuccessfulTransactionModal';

import SubmitSection from './SubmitSection';
import { useStyles } from './styles';
import TEST_IDS from './testIds';
import { FormValues } from './types';
import useFormValidation from './useFormValidation';
import useGetSwapInfo, { SwapError } from './useGetSwapInfo';

const readableSlippageTolerancePercentage = formatToReadablePercentage(
  SLIPPAGE_TOLERANCE_PERCENTAGE,
);

const initialFormValues: FormValues = {
  fromToken: UNISWAP_TOKENS.eth,
  fromTokenAmountTokens: '',
  toToken: config.isOnTestnet ? TESTNET_UNISWAP_TOKENS.xcn : MAINNET_UNISWAP_TOKENS.xcn,
  toTokenAmountTokens: '',
  direction: 'exactAmountIn',
};

export interface SwapPageUiProps {
  formValues: FormValues;
  setFormValues: (setter: (currentFormValues: FormValues) => FormValues) => void;
  onSubmit: (swap: Swap) => Promise<TransactionReceipt>;
  isSubmitting: boolean;
  tokenBalances: TokenBalance[];
  swap?: Swap;
  swapError?: SwapError;
}

const SwapPageUi: React.FC<SwapPageUiProps> = ({
  formValues,
  setFormValues,
  swap,
  swapError,
  onSubmit,
  isSubmitting,
  tokenBalances,
}) => {
  const styles = useStyles();
  const { t, Trans } = useTranslation();

  const { openSuccessfulTransactionModal } = useSuccessfulTransactionModal();

  const { fromTokenUserBalanceWei, toTokenUserBalanceWei } = useMemo(
    () =>
      tokenBalances.reduce(
        (acc, tokenBalance) => {
          if (
            tokenBalance.token.address.toLowerCase() === formValues.fromToken.address.toLowerCase()
          ) {
            acc.fromTokenUserBalanceWei = tokenBalance.balanceWei;
          } else if (
            tokenBalance.token.address.toLowerCase() === formValues.toToken.address.toLowerCase()
          ) {
            acc.toTokenUserBalanceWei = tokenBalance.balanceWei;
          }

          return acc;
        },
        {
          fromTokenUserBalanceWei: undefined,
          toTokenUserBalanceWei: undefined,
        } as {
          fromTokenUserBalanceWei?: BigNumber;
          toTokenUserBalanceWei?: BigNumber;
        },
      ),
    [tokenBalances, formValues.fromToken, formValues.toToken],
  );

  useEffect(() => {
    if (swap?.direction === 'exactAmountIn') {
      setFormValues(currentFormValues => ({
        ...currentFormValues,
        toTokenAmountTokens: convertWeiToTokens({
          valueWei: swap.expectedToTokenAmountReceivedWei,
          token: swap.toToken,
        }).toFixed(),
      }));
    }

    if (swap?.direction === 'exactAmountOut') {
      setFormValues(currentFormValues => ({
        ...currentFormValues,
        fromTokenAmountTokens: convertWeiToTokens({
          valueWei: swap.expectedFromTokenAmountSoldWei,
          token: swap.fromToken,
        }).toFixed(),
      }));
    }
  }, [swap]);

  const switchTokens = () =>
    setFormValues(currentFormValues => ({
      ...currentFormValues,
      fromToken: currentFormValues.toToken,
      fromTokenAmountTokens:
        currentFormValues.direction === 'exactAmountIn'
          ? initialFormValues.toTokenAmountTokens
          : currentFormValues.toTokenAmountTokens,
      toToken: currentFormValues.fromToken,
      toTokenAmountTokens:
        currentFormValues.direction === 'exactAmountIn'
          ? currentFormValues.fromTokenAmountTokens
          : initialFormValues.fromTokenAmountTokens,
      direction:
        currentFormValues.direction === 'exactAmountIn' ? 'exactAmountOut' : 'exactAmountIn',
    }));

  const maxFromInput = useMemo(() => {
    if (!fromTokenUserBalanceWei) {
      return new BigNumber(0).toFixed();
    }

    const maxFromInputTokens = convertWeiToTokens({
      valueWei: fromTokenUserBalanceWei,
      token: formValues.fromToken,
    });

    return maxFromInputTokens.toFixed();
  }, [formValues.fromToken, fromTokenUserBalanceWei]);

  const handleSubmit = async () => {
    if (swap) {
      try {
        const transactionReceipt = await onSubmit(swap);

        openSuccessfulTransactionModal({
          title: t('swapPage.successfulConvertTransactionModal.title'),
          content: t('swapPage.successfulConvertTransactionModal.message'),
          transactionHash: transactionReceipt.transactionHash,
        });

        // Reset form on success
        setFormValues(currentFormValues => ({
          ...currentFormValues,
          fromTokenAmountTokens: initialFormValues.fromTokenAmountTokens,
          toTokenAmountTokens: initialFormValues.toTokenAmountTokens,
        }));
      } catch (err) {
        toast.error({ message: (err as Error).message });
      }
    }
  };

  // Define lists of tokens for each text field
  const { fromTokenBalances, toTokenBalances } = useMemo(() => {
    const fromTokenBalancesTmp = tokenBalances.filter(
      tokenBalance =>
        tokenBalance.token.address.toLowerCase() !== formValues.fromToken.address.toLowerCase(),
    );
    const toTokenBalancesTmp = tokenBalances.filter(
      tokenBalance =>
        tokenBalance.token.address.toLowerCase() !== formValues.toToken.address.toLowerCase(),
    );

    return {
      fromTokenBalances: fromTokenBalancesTmp,
      toTokenBalances: toTokenBalancesTmp,
    };
  }, [tokenBalances, formValues.fromToken.address, formValues.toToken.address]);

  const readableFromTokenUserBalance = useConvertWeiToReadableTokenString({
    valueWei: fromTokenUserBalanceWei,
    token: formValues.fromToken,
  });

  const readableToToTokenUserBalance = useConvertWeiToReadableTokenString({
    valueWei: toTokenUserBalanceWei,
    token: formValues.toToken,
  });

  // Form validation
  const { isFormValid, errors: formErrors } = useFormValidation({
    swap,
    formValues,
    fromTokenUserBalanceWei,
  });

  return (
    <Paper css={styles.container}>
      <ConnectWallet message={t('swapPage.connectWalletToSwap')}>
        <SelectTokenTextField
          label={t('swapPage.fromTokenAmountField.label')}
          selectedToken={formValues.fromToken}
          value={formValues.fromTokenAmountTokens}
          hasError={formErrors.includes('FROM_TOKEN_AMOUNT_HIGHER_THAN_USER_BALANCE')}
          data-testid={TEST_IDS.fromTokenSelectTokenTextField}
          disabled={isSubmitting}
          onChange={amount =>
            setFormValues(currentFormValues => ({
              ...currentFormValues,
              fromTokenAmountTokens: amount,
              // Reset toTokenAmount field value if users resets fromTokenAmount
              // field value
              toTokenAmountTokens:
                amount === ''
                  ? initialFormValues.toTokenAmountTokens
                  : currentFormValues.toTokenAmountTokens,
              direction: 'exactAmountIn',
            }))
          }
          onChangeSelectedToken={token =>
            setFormValues(currentFormValues => ({
              ...currentFormValues,
              fromToken: token,
              // Invert toToken and fromToken if selected token is the same as
              // toToken
              toToken:
                token.address === formValues.toToken.address
                  ? currentFormValues.fromToken
                  : currentFormValues.toToken,
            }))
          }
          rightMaxButton={{
            label: t('swapPage.fromTokenAmountField.max').toUpperCase(),
            valueOnClick: maxFromInput,
          }}
          tokenBalances={fromTokenBalances}
          css={styles.selectTokenTextField}
        />

        <Typography component="div" variant="small2" css={styles.greyLabel}>
          <Trans
            i18nKey="selectTokenTextField.walletBalance"
            components={{
              White: <span css={styles.whiteLabel} />,
            }}
            values={{
              balance: readableFromTokenUserBalance,
            }}
          />
        </Typography>

        <TertiaryButton
          css={styles.switchButton}
          onClick={switchTokens}
          disabled={isSubmitting}
          data-testid={TEST_IDS.switchTokensButton}
        >
          <Icon name="convert" css={styles.switchButtonIcon} />
        </TertiaryButton>

        <SelectTokenTextField
          label={t('swapPage.toTokenAmountField.label')}
          selectedToken={formValues.toToken}
          value={formValues.toTokenAmountTokens}
          disabled={isSubmitting}
          data-testid={TEST_IDS.toTokenSelectTokenTextField}
          onChange={amount =>
            setFormValues(currentFormValues => ({
              ...currentFormValues,
              toTokenAmountTokens: amount,
              // Reset fromTokenAmount field value if users resets toTokenAmount
              // field value
              fromTokenAmountTokens:
                amount === ''
                  ? initialFormValues.fromTokenAmountTokens
                  : currentFormValues.fromTokenAmountTokens,
              direction: 'exactAmountOut',
            }))
          }
          onChangeSelectedToken={token =>
            setFormValues(currentFormValues => ({
              ...currentFormValues,
              toToken: token,
              // Invert fromToken and toToken if selected token is the same as
              // fromToken
              fromToken:
                token.address === formValues.fromToken.address
                  ? currentFormValues.toToken
                  : currentFormValues.fromToken,
            }))
          }
          tokenBalances={toTokenBalances}
          css={styles.selectTokenTextField}
        />

        <Typography component="div" variant="small2" css={styles.greyLabel}>
          <Trans
            i18nKey="selectTokenTextField.walletBalance"
            components={{
              White: <span css={styles.whiteLabel} />,
            }}
            values={{
              balance: readableToToTokenUserBalance,
            }}
          />
        </Typography>

        {swap && (
          <div data-testid={TEST_IDS.swapDetails}>
            <LabeledInlineContent label={t('swapPage.exchangeRate.label')} css={styles.swapInfoRow}>
              {t('swapPage.exchangeRate.value', {
                fromTokenSymbol: formValues.fromToken.symbol,
                toTokenSymbol: formValues.toToken.symbol,
                rate: swap.exchangeRate.toFixed(),
              })}
            </LabeledInlineContent>

            <LabeledInlineContent
              label={t('swapPage.slippageTolerance.label')}
              css={styles.swapInfoRow}
            >
              {readableSlippageTolerancePercentage}
            </LabeledInlineContent>

            <LabeledInlineContent
              label={
                swap.direction === 'exactAmountIn'
                  ? t('swapPage.minimumReceived.label')
                  : t('swapPage.maximumSold.label')
              }
              css={styles.swapInfoRow}
            >
              {convertWeiToTokens({
                valueWei:
                  swap.direction === 'exactAmountIn'
                    ? swap.minimumToTokenAmountReceivedWei
                    : swap.maximumFromTokenAmountSoldWei,
                token: swap.direction === 'exactAmountIn' ? swap.toToken : swap.fromToken,
                returnInReadableFormat: true,
              })}
            </LabeledInlineContent>
          </div>
        )}

        <SubmitSection
          onSubmit={handleSubmit}
          fromToken={formValues.fromToken}
          isSubmitting={isSubmitting}
          isFormValid={isFormValid}
          formErrors={formErrors}
          swap={swap}
          swapError={swapError}
        />
      </ConnectWallet>
    </Paper>
  );
};

const SwapPage: React.FC = () => {
  const { account } = React.useContext(AuthContext);

  const [formValues, setFormValues] = useState<FormValues>(initialFormValues);

  const swapInfo = useGetSwapInfo({
    fromToken: formValues.fromToken,
    fromTokenAmountTokens: formValues.fromTokenAmountTokens,
    toToken: formValues.toToken,
    toTokenAmountTokens: formValues.toTokenAmountTokens,
    direction: formValues.direction,
  });

  const { data: tokenBalances } = useGetSwapTokenUserBalances({
    accountAddress: account?.address,
  });

  const { mutateAsync: swapTokens, isLoading: isSwapTokensLoading } = useSwapTokens();

  const onSwap = async (swap: Swap) => {
    if (!account?.address) {
      throw new VError({ type: 'unexpected', code: 'walletNotConnected' });
    }

    return swapTokens({
      swap,
      fromAccountAddress: account?.address,
    });
  };

  return (
    <SwapPageUi
      formValues={formValues}
      setFormValues={setFormValues}
      swap={swapInfo.swap}
      swapError={swapInfo.error}
      tokenBalances={tokenBalances}
      onSubmit={onSwap}
      isSubmitting={isSwapTokensLoading}
    />
  );
};

export default SwapPage;
