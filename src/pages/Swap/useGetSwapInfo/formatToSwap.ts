import { Percent as PSPercent } from '@uniswap/sdk';
import BigNumber from 'bignumber.js';
import { Swap } from 'types';
import { convertTokensToWei } from 'utilities';

import { SLIPPAGE_TOLERANCE_PERCENTAGE } from 'constants/swap';

import { FormatToSwapInput, FormatToSwapOutput } from './types';

const slippagePercent = new PSPercent(`${SLIPPAGE_TOLERANCE_PERCENTAGE * 10}`, '1000');

// Format trade to swap info
const formatToSwap = ({ trade, input }: FormatToSwapInput): FormatToSwapOutput => {
  const routePath = trade.route.path.map(token => token.address);

  if (input.direction === 'exactAmountIn') {
    const swap: Swap = {
      fromToken: input.fromToken,
      toToken: input.toToken,
      direction: 'exactAmountIn',
      routePath,
      fromTokenAmountSoldWei: convertTokensToWei({
        value: new BigNumber(trade.inputAmount.toFixed()),
        token: input.fromToken,
      }),
      expectedToTokenAmountReceivedWei: convertTokensToWei({
        value: new BigNumber(trade.outputAmount.toFixed()),
        token: input.toToken,
      }),
      minimumToTokenAmountReceivedWei: convertTokensToWei({
        value: new BigNumber(trade.minimumAmountOut(slippagePercent).toFixed()),
        token: input.toToken,
      }),
      exchangeRate: new BigNumber(trade.executionPrice.toFixed(input.toToken.decimals)).dp(
        input.toToken.decimals,
      ),
    };

    return swap;
  }

  // "exactAmountOut" case
  const swap: Swap = {
    fromToken: input.fromToken,
    toToken: input.toToken,
    direction: 'exactAmountOut',
    routePath,
    expectedFromTokenAmountSoldWei: convertTokensToWei({
      value: new BigNumber(trade.inputAmount.toFixed()),
      token: input.fromToken,
    }),
    maximumFromTokenAmountSoldWei: convertTokensToWei({
      value: new BigNumber(trade.maximumAmountIn(slippagePercent).toFixed()),
      token: input.toToken,
    }),
    toTokenAmountReceivedWei: convertTokensToWei({
      value: new BigNumber(trade.outputAmount.toFixed()),
      token: input.toToken,
    }),
    exchangeRate: new BigNumber(trade.executionPrice.toFixed(input.toToken.decimals)).dp(
      input.toToken.decimals,
    ),
  };

  return swap;
};

export default formatToSwap;
