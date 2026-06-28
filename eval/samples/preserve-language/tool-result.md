# Impression System

没有人干活要先把工作手册背下来；略读一遍，留下“印象”就开工才是正确做法。Impression System (印象系统) 是一个可即插即用的 [pi](https://github.com/badlogic/pi-mono) 扩展：它会使用当前激活的 LLM，将较长的工具结果压缩成简洁的 impression，并保留原始内容，供后续按需召回。

> 提示：如果同时加载 `docker` 插件，Impression 会把累计的 `[impression:data]` 统计更清晰地展示在 docker 侧边栏里；如果没有 docker，则会自动回退为普通 footer 状态显示。

## 要解决的问题

在长时间编码会话中，工具结果（文件读取、命令输出、搜索结果）会迅速堆积到对话上下文中。大部分内容只会被看一次、理解一次，之后基本不会再引用，但它们依然会持续占用上下文窗口，消耗 token，并分散模型注意力。在一次读取 20 个以上文件的典型会话里，impression system 通常可以将上下文占用降低 40% 到 70%。

## 工作原理

1. **Intercept**：拦截每一个 `tool_result` 事件；当文本长度超过可配置阈值时（默认 2,048 个字符），启动蒸馏。
2. **Distill**：调用当前激活的模型，并使用专门设计的提示词，告诉模型“你正在压缩自己的记忆”。模型会产出一段简短笔记，保留下一步真正需要的信息。
3. **Replace**：用压缩后的 impression 替换原始工具结果。
4. **Recall**：注册一个 `recall_impression` 工具，代理可以按需取回原始内容。首次召回时，模型会结合更新后的上下文重新蒸馏；达到配置的召回次数后，则直接返回完整原文。

`prompts/` 目录中的蒸馏提示词经过专门设计，使模型将这个过程视为“自我压缩”，而不是对第三方内容做摘要。模型会拿到完整的可见历史和 system prompt，因此生成的 impression 具备上下文感知能力。

## 快速开始

### 前置要求

- **Node.js** ≥ 18（包含 npm）
- **Python 3** ≥ 3.9（仅用于安装脚本）
- 至少一个 LLM provider 的 API Key（Anthropic、OpenAI、Google、OpenRouter 等）

### 自动安装

```bash
python3 setup.py
```

安装脚本会完成以下操作：
1. 检查是否已全局安装 pi，如未安装则尝试安装
2. 以交互方式配置 LLM API Key（可跳过）
3. 将当前目录注册为 pi 扩展（可跳过）

支持 **macOS**、**Linux** 和 **Windows**（PowerShell / Git Bash / WSL）。

