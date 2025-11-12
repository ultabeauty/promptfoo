import chalk from 'chalk';
import Table from 'cli-table3';
import { TERMINAL_MAX_WIDTH } from './constants';
import { type EvaluateTable, ResultFailureReason } from './types/index';
import { ellipsize } from './util/text';

export function generateTable(
  evaluateTable: EvaluateTable,
  tableCellMaxLength = 250,
  maxRows = 25,
): string {
  const head = evaluateTable.head;
  const headLength = head.prompts.length + head.vars.length + 2; // +2 for tokens and price columns
  const table = new Table({
    head: [
      ...head.vars,
      ...head.prompts.map((prompt) => `[${prompt.provider}] ${prompt.label}`),
      'Tokens',
      'Price',
    ].map((h) => ellipsize(h, tableCellMaxLength)),
    colWidths: Array(headLength).fill(Math.floor(TERMINAL_MAX_WIDTH / headLength)),
    wordWrap: true,
    wrapOnWordBoundary: true, // if false, ansi colors break
    style: {
      head: ['blue', 'bold'],
    },
  });
  // Skip first row (header) and add the rest. Color PASS/FAIL
  for (const row of evaluateTable.body.slice(0, maxRows)) {
    const rowData = [
      ...row.vars.map((v) => ellipsize(v, tableCellMaxLength)),
    ];

    // Add output columns with tokens and price
    for (const output of row.outputs) {
      let text = ellipsize(output.text, tableCellMaxLength);
      if (output.pass) {
        text = chalk.green('[PASS] ') + text;
      } else if (!output.pass) {
        // color everything red up until '---'
        text = (
          chalk.red(output.failureReason === ResultFailureReason.ASSERT ? '[FAIL] ' : '[ERROR] ') +
          text
            .split('---')
            .map((c, idx) => (idx === 0 ? chalk.red.bold(c) : c))
            .join('---')
        );
      }
      rowData.push(text);
    }

    // Add tokens and price columns (combine all token types into JSON for tokens column)
    const allTokens = row.outputs.reduce((acc, output) => {
      // Provider tokens
      if (output.tokenUsage) {
        acc.prompt += output.tokenUsage.prompt || 0;
        acc.completion += output.tokenUsage.completion || 0;
        acc.cached += output.tokenUsage.cached || 0;
        acc.reasoning += output.tokenUsage.completionDetails?.reasoning || 0;
      }
      // Assertion tokens - prioritize gradingResult.tokensUsed if available, otherwise use tokenUsage.assertions
      const assertionTokens = output.gradingResult?.tokensUsed || output.tokenUsage?.assertions;
      if (assertionTokens) {
        acc.prompt += assertionTokens.prompt || 0;
        acc.completion += assertionTokens.completion || 0;
        acc.cached += assertionTokens.cached || 0;
        acc.reasoning += assertionTokens.completionDetails?.reasoning || 0;
      }
      return acc;
    }, { prompt: 0, completion: 0, cached: 0, reasoning: 0 });

    const costBreakdown = row.outputs.reduce(
      (acc, output) => {
        // Use output.price if available (contains breakdown), otherwise calculate breakdown
        if (output.gradingResult?.price) {
          acc.promptCost += output.gradingResult?.price.input || 0;
          acc.completionCost += output.gradingResult?.price.completion || 0;
          acc.cachedCost += output.gradingResult?.price.cached || 0;
          acc.totalCost += output.gradingResult?.price.total || output.cost || 0;
        } else {
          // Break down cost by token type if we have token usage info
          if (output.tokenUsage?.assertions || output.gradingResult?.tokensUsed) {
            const tokenUsage = output.tokenUsage?.assertions || output.gradingResult?.tokensUsed;
            if (tokenUsage) {
              const promptTokens = tokenUsage.prompt || 0;
              const completionTokens = tokenUsage.completion || 0;
              const cachedTokens = tokenUsage.cached || 0;
              const totalTokens = promptTokens + completionTokens + cachedTokens;

              if (totalTokens > 0) {
                const costPerToken = output.cost / totalTokens;
                acc.promptCost += promptTokens * costPerToken;
                acc.completionCost += completionTokens * costPerToken;
                acc.cachedCost += cachedTokens * costPerToken;
              } else {
                acc.totalCost += output.cost;
              }
            } else {
              acc.totalCost += output.cost;
            }
          } else {
            acc.totalCost += output.cost;
          }
        }
        return acc;
      },
      { promptCost: 0, completionCost: 0, cachedCost: 0, totalCost: 0 },
    );

    const totalPrice = costBreakdown.totalCost;
    const costFormatted = JSON.stringify(
      {
        input: `$${costBreakdown.promptCost.toFixed(4)}`,
        output: `$${costBreakdown.completionCost.toFixed(4)}`,
        cached: `$${costBreakdown.cachedCost.toFixed(4)}`,
        total: `$${totalPrice.toFixed(4)}`,
      },
      null,
      2,
    );

    rowData.push(JSON.stringify(allTokens, null, 2));
    rowData.push(costFormatted);

    table.push(rowData);
  }
  return table.toString();
}

export function wrapTable(
  rows: Record<string, string | number>[],
  columnWidths?: Record<string, number>,
) {
  if (rows.length === 0) {
    return 'No data to display';
  }
  const head = Object.keys(rows[0]);

  // Calculate widths based on content and terminal width
  const defaultWidth = Math.floor(TERMINAL_MAX_WIDTH / head.length);
  const colWidths = head.map((column) => columnWidths?.[column] || defaultWidth);

  const table = new Table({
    head,
    colWidths,
    wordWrap: true,
    wrapOnWordBoundary: true,
  });
  for (const row of rows) {
    table.push(Object.values(row));
  }
  return table.toString();
}
