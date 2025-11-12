import yaml from 'js-yaml';
import { getEnvBool, getEnvInt } from '../envars';

import type { ApiProvider } from '../types/index';

/**
 * The default timeout for API requests in milliseconds.
 */
export const REQUEST_TIMEOUT_MS = getEnvInt('REQUEST_TIMEOUT_MS', 300_000);

interface ModelCost {
  input: number;
  output: number;
  cachedInput?: number;
  audioInput?: number;
  audioOutput?: number;
}

interface ProviderModel {
  id: string;
  cost?: ModelCost;
}

export interface ProviderConfig {
  cost?: number;
  cachedCost?: number;
  audioCost?: number;
}

/**
 * Calculates the cost of an API call based on the model and token usage.
 *
 * @param {string} modelName The name of the model used.
 * @param {ProviderConfig} config The provider configuration.
 * @param {number | undefined} promptTokens The number of tokens in the prompt.
 * @param {number | undefined} completionTokens The number of tokens in the completion.
 * @param {ProviderModel[]} models An array of available models with their costs.
 * @param {number | undefined} cachedTokens The number of cached tokens in the prompt.
 * @returns {number | undefined} The calculated cost, or undefined if it can't be calculated.
 */
export function calculateCost(
  modelName: string,
  config: ProviderConfig,
  promptTokens: number | undefined,
  completionTokens: number | undefined,
  models: ProviderModel[],
  cachedTokens?: number | undefined,
): number | undefined {
  if (
    !Number.isFinite(promptTokens) ||
    !Number.isFinite(completionTokens) ||
    typeof promptTokens === 'undefined' ||
    typeof completionTokens === 'undefined'
  ) {
    return undefined;
  }

  const model = models.find((m) => m.id === modelName);
  if (!model || !model.cost) {
    return undefined;
  }

  const inputCost = config.cost ?? model.cost.input;
  const outputCost = config.cost ?? model.cost.output;
  let totalCost = outputCost * completionTokens;

  if (cachedTokens && model.cost.cachedInput !== undefined && cachedTokens <= promptTokens) {
    const cachedCost = config.cachedCost ?? model.cost.cachedInput;
    const nonCachedPromptTokens = promptTokens - cachedTokens;
    totalCost += nonCachedPromptTokens * inputCost + cachedTokens * cachedCost;
  } else {
    totalCost += inputCost * promptTokens;
  }

  return totalCost || undefined;
}

/**
 * Parses a chat prompt string into a structured format.
 *
 * @template T The expected return type of the parsed prompt.
 * @param {string} prompt The input prompt string to parse.
 * @param {T} defaultValue The default value to return if parsing fails.
 * @returns {T} The parsed prompt or the default value.
 * @throws {Error} If the prompt is invalid YAML or JSON (when required).
 */
export function parseChatPrompt<T>(prompt: string, defaultValue: T): T {
  const trimmedPrompt = prompt.trim();
  if (trimmedPrompt.startsWith('- role:')) {
    try {
      // Try YAML - some legacy OpenAI prompts are YAML :(
      return yaml.load(prompt) as T;
    } catch (err) {
      throw new Error(`Chat Completion prompt is not a valid YAML string: ${err}\n\n${prompt}`);
    }
  } else {
    try {
      // Try JSON
      return JSON.parse(prompt) as T;
    } catch (err) {
      if (
        getEnvBool('PROMPTFOO_REQUIRE_JSON_PROMPTS') ||
        (trimmedPrompt.startsWith('{') && trimmedPrompt.endsWith('}')) ||
        (trimmedPrompt.startsWith('[') && trimmedPrompt.endsWith(']'))
      ) {
        throw new Error(`Chat Completion prompt is not a valid JSON string: ${err}\n\n${prompt}`);
      }
      // Fall back to the provided default value
      return defaultValue;
    }
  }
}

/**
 * Converts a string to title case.
 *
 * @param {string} str The input string to convert.
 * @returns {string} The input string converted to title case.
 */
export function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

export function isPromptfooSampleTarget(provider: ApiProvider) {
  const url = provider.config?.url;
  return url?.includes('promptfoo.app') || url?.includes('promptfoo.dev');
}
