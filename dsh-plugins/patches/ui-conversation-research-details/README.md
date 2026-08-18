# ui-conversation 补丁：右侧详情栏 research 坑位

研究区（ui-research-workspace）点击论文后，右侧栏（3 窗栏）显示 Paper 详情。

**改动**（相对 DSH 官方源，3 个文件）：
- `contract/slots.ts`：声明 `conversation.details.research` 坑位（single/root）+ DetailsSlotProps 渲染联合
- `apply.ts`：details 注册的 children 增加该坑位
- `skeleton/DetailsPanel.tsx`：body 顶部渲染 `renderSlot('conversation.details.research')`
  （无论文选择时自渲染 null，不影响工具详情）

**应用**（checkout 重装后）：
```sh
cd deepseek-harness-master
cp dsh-plugins/patches/ui-conversation-research-details/*.ts packages/client/ui-conversation/src/client/contract/  # slots.ts 到 contract/
cp dsh-plugins/patches/ui-conversation-research-details/apply.ts packages/client/ui-conversation/src/client/
cp dsh-plugins/patches/ui-conversation-research-details/DetailsPanel.tsx packages/client/ui-conversation/src/client/skeleton/
pnpm --filter @deepseek-ai/dsh-client-ui-conversation bundle
```
