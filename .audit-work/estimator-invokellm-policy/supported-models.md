> ## Documentation Index
> Fetch the complete documentation index at: https://docs.base44.com/llms.txt
> Use this file to discover all available pages before exploring further.

# Supported Models

> The AI models you can choose for agents and invokeLLM, and what happens when Base44 retires one.

Set any of these as the `model` field on an [agent](https://docs.base44.com/developers/backend/resources/agents/overview.md), or as the `model` parameter to [invokeLLM](https://docs.base44.com/Integrations/built-in-integrations.md#choosing-the-model-for-invokellm) to override the app-level model for a single call.

## Available models

Use `automatic` to let Base44 choose a model for you, or set a specific preset ID to pin the behavior:

| Model | Provider | Preset ID |
| - | - | - |
| Claude Sonnet 5 | Anthropic | `claude-sonnet-5` |
| Claude Opus 5.5 | Anthropic | `claude_opus_5_5` |
| Claude Fable 5.1 | Anthropic | `claude_fable_5_1` |
| GPT-6.1 Sol | OpenAI | `gpt_6_sol` |
| GPT-6 Luna | OpenAI | `gpt_6_luna` |
| GPT-6 Astra | OpenAI | `gpt_6_astra` |
| Gemini 3.8 Flash | Google | `gemini_3_8_flash` |
| GLM 5.2 | Zhipu | `glm_5_2` |

> [!NOTE]
>
> `automatic` is the default. It currently runs a fast, low cost model tuned for everyday tasks. Pin a specific preset ID instead only when your app depends on the behavior of that particular model.

## Model retirement

Base44 periodically retires older models. Your app keeps working when that happens: calls that name a retired preset ID are routed to a current model chosen to be close to it in capability and cost, so nothing breaks and credit usage stays in a similar range. Responses can differ in style or quality, since your app is no longer using the model you originally picked. Base44 doesn't rewrite your configuration for you, so an agent set up before a retirement still shows the old preset ID in its `model` field even though it now runs on the replacement.

## See also

* [Agents](https://docs.base44.com/developers/backend/resources/agents/overview.md): Set `model` to choose which model your agent runs on.
* [Built-in integrations](https://docs.base44.com/Integrations/built-in-integrations.md): Use `model` with invokeLLM to override the app-level model for a single call.


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.