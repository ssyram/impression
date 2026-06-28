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

### 手动安装

#### 1. 安装 pi

```bash
npm install -g @earendil-works/pi-coding-agent
```

#### 2. 设置 API Key

```bash
# 任选一种：
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export GOOGLE_API_KEY="AI..."
export OPENROUTER_API_KEY="sk-or-..."
```

#### 3. 安装扩展

```bash
# 在当前目录下执行：
pi install .

# 或在任意目录执行：
pi install /path/to/impression
```

**另一种方式**：不安装，按会话临时加载扩展：

```bash
pi --extension /path/to/impression/index.ts
```

## 项目结构

```text
impression/
├── index.ts                  # 扩展入口（连接事件与工具）
├── src/
│   ├── types.ts              # 接口、类型守卫、常量
│   ├── config.ts             # 配置加载、解析、skip pattern 匹配
│   ├── serialize.ts          # 内容序列化（文本 + 图片）
│   ├── prompt-loader.ts      # 加载并填充 prompt 模板
│   ├── distill.ts            # 蒸馏逻辑（调用 LLM）
│   ├── format-call.ts        # UI：格式化 recall 的工具调用展示
│   └── result-builders.ts    # 构建 impression / passthrough 的工具结果
├── prompts/                                # prompts 全部是 .md
│   ├── distiller-first-person.md           # 蒸馏 system prompt——第一人称变体
│   ├── distiller-third-person.md           # 蒸馏 system prompt——第三人称变体
