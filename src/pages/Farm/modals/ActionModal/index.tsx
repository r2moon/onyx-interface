/** @jsxImportSource @emotion/react */
import { ConnectWallet, EnableToken, Modal, ModalProps, Spinner } from 'components';
import React from 'react';
import { Token } from 'types';

import TransactionForm, { TransactionFormProps } from '../../TransactionForm';

export interface ActionModalProps extends Pick<ModalProps, 'handleClose'>, TransactionFormProps {
  token1: Token;
  token2: Token;
  title: ModalProps['title'];
  isInitialLoading: boolean;
  connectWalletMessage: string;
  spenderAddress?: string;
  tokenNeedsToBeEnabled?: boolean;
  enableTokenMessage?: string;
}

const ActionModal: React.FC<ActionModalProps> = ({
  handleClose,
  token,
  token1,
  token2,
  spenderAddress,
  isInitialLoading,
  title,
  connectWalletMessage,
  tokenNeedsToBeEnabled = false,
  enableTokenMessage,
  ...otherTransactionFormProps
}) => {
  const transactionFormDom = <TransactionForm token={token} {...otherTransactionFormProps} />;
  const content =
    tokenNeedsToBeEnabled && !!enableTokenMessage && !!spenderAddress ? (
      <EnableToken
        title={enableTokenMessage}
        token={token}
        token1={token1}
        token2={token2}
        spenderAddress={spenderAddress}
      >
        {transactionFormDom}
      </EnableToken>
    ) : (
      transactionFormDom
    );

  return (
    <Modal isOpen title={title} handleClose={handleClose}>
      {isInitialLoading ? (
        <Spinner />
      ) : (
        <ConnectWallet message={connectWalletMessage}>{content}</ConnectWallet>
      )}
    </Modal>
  );
};

export default ActionModal;
