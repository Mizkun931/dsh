# Agent Note: 桌面开屏按已发布的启动信号交接窗口，shimmer 只在已填充区域内扫动

Status: implemented

[English](2026-08-15-desktop-splash-boot-signal-handoff.md) | 中文

## Problem

桌面启动器连续显示了两段开屏动画。带边框的全屏 splash 窗口（真实的那段，由实际的构建/服务进度驱动）关闭后露出主窗口，而主窗口还在渲染 Web 外壳自己的启动页——即已废弃的动画——随后才切到真实 UI。交接条件是根因：`waitForMainAppReady` 用页面文本（`document.body.innerText` 包含 `Loading plugins…`）猜测启动是否完成，而启动器在 `dsh web` 打印出 URL 的那一刻就上报了 100% 进度——此时客户端启动（bundle 拉取 + cordis Loader settle）才刚刚开始。进度显示已读完，而废弃动画还要继续播，于是切换落到了它上面。

splash 进度条还有另一个独立缺陷。shimmer 是轨道内与填充条平级的元素，扫光动画让该元素横穿整条轨道，与 `progress-fill` 的宽度无关，因此在任何填充比例下扫光都会掠过未填充的轨道。

## Decision

Web 外壳内核发布权威的启动状态，不再让启动器去匹配文案。[loader-status.ts](../../../packages/client/web/src/loader-status.ts) 中的 `publishBootState` 把 `data-dsh-boot`（`loading` / `ready` / `failed`）写到 `<html>` 上；[boot.tsx](../../../packages/client/web/src/boot.tsx) 在 `run()` 开始时发布 `loading`，settle 后发布 `ready`，fail-loud 的 catch 里发布 `failed`。

[main.ts](../../../apps/desktop/src/main.ts) 中的 `waitForMainAppReady` 轮询该 dataset 信号（50 ms 周期、30 s 超时；`failed` 状态抛启动失败并以页面文本作为详情）。文本匹配猜测与 260 ms 稳定窗口被删除——信号本身是终态，稳定期不再有意义。

splash 进度不再提前封顶。[launcher.ts](../../../apps/desktop/src/launcher.ts) 的 `READY_PROGRESS` 在服务端打印 URL 时从 100 降为 96，`bootDesktop` 只在 `waitForMainAppReady` 解决后才设置最终 100，紧跟 `mainWindow.show()`。100% 与可见切换现在同时发生。

[splash.html](../../../apps/desktop/assets/splash.html) 中的 shimmer 移入 `.progress-fill` 内部，fill 增加 `overflow: hidden`。扫光动画仍为 `translateX(-120%) → 320%`，但 fill 将其裁剪，因此任何填充比例下扫光都只在已填充区域内运动；脚本的宽度/开关契约不变。

## Alternatives considered

**保留 innerText 匹配、只修时序。** 文本猜测已覆盖常见情形，因此更窄的改动很诱人。否决：该匹配本质脆弱——加载文案一旦变化、本地化、或出现在真实会话内容中即失效——而且除这段文案之外，它无法区分加载页与就绪 UI。

**轮询真实 UI 的 DOM 特征（例如稳定的选择器）而非内核信号。** 可以避免改动外壳内核。否决：选择器仍是猜测，归属渲染它的 UI 包；而启动内核本来就拥有唯一权威事实——settle。

**保持 shimmer 为轨道级元素，用宽度动画跟随填充条。** 早前版本正是如此（`progressShimmer.style.width = percent%` + 内部扫光）。否决：它让脚本同时耦合两个元素，且重复了填充条的几何；嵌套进 fill 则从 CSS 免费获得裁剪。

**直接删除 Web 外壳启动页。** 加载页仍是直接打开 `dsh web` 的浏览器用户与启动失败场景的 fail-loud 表面，因此保留；桌面的修法是不让它露面，而不是删除它。

## Consequences

桌面启动现在只显示一段开屏动画：窗口在 Web 外壳 settle 后交接，主窗口直接出现在真实 UI 上。直接访问的浏览器用户仍可能看到被替代的启动页一闪而过——那正是它在浏览器场景的本职。

启动状态信号是一份新的跨表面契约：desktop 与 Web 外壳必须同版本发布。轮询该信号的 desktop 若配到更早的 Web 外壳，会读不到 dataset 值并落到 30 s 超时——是降级但安全的路径，而非失败。`dsh-client-web` 的 README 已记录该信号。

splash 进度在客户端启动期间停在 96%，切换时跳至 100%；fill 的过渡平滑了这一跳。构建输出标记细分为七个档位（14/24/36/46/58/70/80），且只匹配 npm 脚本横幅（`> pkg@version script`），命令回显行不会在启动瞬间把每个脚本都标记为已开始。静默阶段——tsc、tsdown、vite、无输出的服务端启动与客户端启动——按指数逼近（4 秒时间常数）从上一档位朝下一档位估算前进，永不触及：进度条在每个静默段持续爬升，真实事件到达时立即对齐。

## Testing

`packages/client/web/tests/loader-status.spec.ts` 固定了三种状态的 dataset 契约。`packages/client/web/tests/app-root.client.spec.tsx` 继续固定 AppRoot 门禁，`apps/desktop/tests/launcher.spec.ts` 继续固定 launcher 辅助函数；Electron 窗口交接本身仍是人工验证领域（没有运行 Electron 的 GUI 测试装置）。
