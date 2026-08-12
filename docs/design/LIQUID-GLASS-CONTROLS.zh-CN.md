<!-- canonical-source: docs/design/LIQUID-GLASS-CONTROLS.md -->
<!-- source-sha256: 1689debfef68da7ac7315bb771e8984a0f3ad2c318056c38645c1e0981940edd -->

# Liquid Glass 控件体验规范

> 中文参考版。英文版为准；本文件仅供人类参考。

本文扩展 [DESIGN.md](DESIGN.md)，用于约束 Liquid Glass 主题下的控件。
`CLAUDE.md`、`DESIGN.md`、System 6 对象语法和 feature contract 仍是上位规则。
本文不授权重做 Classic、不改变任务流程，也不引入通用组件库。

本规范吸收了 [Fluid Functionalism](https://www.fluidfunctionalism.com/)
（2026-07-28 查阅）中适合 AI System 6 的经验。值得借鉴的不是它的视觉外形，
而是其核心判断：现代控件之所以显得顺手，是因为材质、悬停、动效和状态会共同
解释界面接下来要做什么。

## 目标感受

Liquid Glass 控件应当：

- 静止时安静；
- 指针或键盘焦点接近时更容易发现；
- 状态切换时保持物理连续；
- 在选中、忙碌、禁用或错误时毫不含糊；
- 在不削弱 System 6 对象隐喻的前提下显得现代。

现代感来自精确反馈和连续性，不来自更多模糊、更大圆角、漂浮卡片或装饰动效。

## 转化后的原则

### 动效传达信息

每个过渡都必须说明状态变化、空间关系或归属边界。选中指示器可以在相邻选项间
移动；popover 可以表现为从触发控件上方抬起；switch thumb 可以从当前位置直接
反向。如果移除动效后没有损失任何信息，就不要添加。

### 悬停是点击前预览

悬停应在激活前确认用户即将触及的控件。使用克制的 tint、rim、字重或局部填充
变化。预览绝不能伪装成已经完成的保存、选择、联网或破坏性动作。

接近响应是可选能力，只适用于 tabs、menu 或 segmented control 这类紧凑且关系
明确的控件组。不得让窗口内无关控件一起响应；键盘焦点必须获得同等清楚的状态。

### 状态切换保持连续

可中断交互应能从当前视觉位置干净地反向，不要让退出排队等待未完成的进入。
退出应略快于进入，避免已关闭的界面显得黏滞。

优先使用项目现有 CSS 和 JS 模式。不要为了复制弹簧物理而引入动画库。如果某种
动效反复出现，应使用具名 token，不要散落 duration 和 easing 字面值。

### 层级相对于基底

popover 必须表现为位于打开它的表面之上，即使它处在 dialog 或另一层 raised
panel 内。层级是局部关系，不是固定全局颜色，也不是任意 `z-index`。

使用现有材质 token 和窗口内 `--z-local-*` 词汇。确实需要重复表面层级时，
使用 substrate、raised control、popover、modal 这样的具名角色；不要照搬八级
阶梯，也不要在没有产品需要时新增全局层级。

### 可发现性要安静，但不能隐藏

在用户滚动前就应能发现 overflow。scrollbar 静止时可以细且低对比，hover 或
正在滚动时再提高对比和宽度。在不遮蔽文字或控件的前提下，可用边缘渐隐提示仍有
内容。样式必须 opt-in 且限定在具体表面；绝不能恢复全局 scrollbar 规则。
触摸优先设备保留原生滚动物理。

## 控件语法

每个交互控件都必须定义 default、hover、键盘 focus、active、selected/checked
（适用时）、disabled，以及该操作可能产生的 loading 或 error 状态。

| 控件 | Liquid Glass 行为 | 避免 |
| --- | --- | --- |
| 主按钮 | 清晰的实体或高对比玻璃填充；标签简洁；按下时只在局部压缩或加深；loading 保持宽度并阻止重复触发。 | 发光、渐变填充、大幅缩放，或 loading 时暗示已经成功。 |
| 次要 / 三级按钮 | 使用相对于基底更安静的填充或 rim；hover 提高局部对比，但不与主操作争夺注意力。 | 把每个动作都做成 pill，或让所有按钮同等抢眼。 |
| 图标按钮 | 命中区稳定；使用可识别的 system icon id；语义不明显时有 tooltip；focus ring 可见。 | 无标签的新奇图标，或在不同状态切换图标家族。 |
| Select / dropdown | 保留 System 6 select harness；trigger 展示当前值；menu 相对基底抬高一个局部表面；hover 只预览一个选项，selected 状态另行明确。 | 原生有限下拉、glass 套 glass 的 blur 堆叠，或把 hover 当 selection。 |
| Tabs / segmented control | 一个连续指示器在相关选项间移动；标签不 reflow；focus 与 selection 分离；选中提交后再切换内容。 | 独立漂浮 pills、布局跳动，或在无关视图间做连续移动。 |
| Switch | 只用于立即生效的二元设置；track 和 thumb 都表达状态；反向时从当前位置开始。 | 用 switch 表示延迟执行的动作，或只依赖颜色。 |
| Checkbox / radio | 保留熟悉形状；接近时提高 rim/fill 对比；checked 状态离散且稳定。 | 变形成陌生符号，或让标签布局参与动画。 |
| Slider | 精度重要时展示数值和单位；thumb 跟随直接操作；离散设置有可见吸附且支持键盘。 | 装饰性轨道、隐藏数值，或指针输入后延迟移动。 |
| List / menu row | 淡淡的局部 hover 可作为预览；若有助于解释分组，可与相邻 selected 几何连续；row action 默认从属。 | 全窗口接近效果，或让 hover 与 selected 难以区分。 |
| Dialog / popover | 从具名 owner 打开；使用正确局部/全局层；落点精确；退出快于进入。 | 过度弹跳、嵌套 blur、脱离归属的漂浮卡片，或关闭方式不清楚。 |
| Scrollbar | clipped 表面始终留有细微 affordance；hover 时提高对比/宽度；保持在 owner pane 内。 | 全局 scrollbar selector，或 thumb 像遗落在内容中。 |
| Progress / thinking | 动效必须对应真实进行中的操作；等待有意义时配具体状态文字。 | 永久装饰性活动，或在没有证据时声称任务已推进。 |

## 材质与表面规则

1. 一个对象只有一个主要 glass surface。嵌套控件优先改变 tint/rim，不要 blur
   套 blur。
2. 文字和图标必须处在稳定可读层。窗口移动时，背景图像或桌面内容不得破坏可读性。
3. active、selected、focused 是三种不同状态：
   - **active**：当前正被指针或键盘按住；
   - **selected**：值或目的地已经提交；
   - **focused**：键盘输入接下来会作用于此。
4. 形状服从对象角色。Liquid Glass 可以用 radius token 变柔和，但 button、field、
   menu row、tab 和 window 不能都退化成同一种 pill。
5. shadow 和 highlight 用于解释分离关系，不作环境装饰。
6. reduced transparency 必须以实体或更不透明填充保持同一层级。

## 动效家族

当 feature 需要反复使用动效时，采用三个语义家族：

| 家族 | 常见用途 | 性格 |
| --- | --- | --- |
| 快速反馈 | Hover、focus rim、checkbox/radio mark、tooltip、scrollbar 强调 | 立即、安静，不可见 overshoot。 |
| 控件过渡 | Tabs indicator、switch thumb、dropdown、accordion、合并选择面 | 连续、精确；输入可反向时必须可中断。 |
| 表面过渡 | Dialog、drawer、大型 question step | 平静进入；只有能强化材质时才允许极轻 overshoot；更快退出。 |

普通产品动效仍受 `DESIGN.md` 限制。默认只动画 `transform` 和 `opacity`，绝不动画
布局几何。在 `prefers-reduced-motion` 下移除位移和缩放，只保留理解状态所需的
最小 opacity 或状态变化。

## 验收清单

实现或批准 Liquid Glass 控件前：

1. 说清现有 System 6 对象角色和 owning surface。
2. 找出相关 base rule、responsive rule、Liquid token/twin、inline layout 以及
   local/global layer。
3. 明确 hover 预览什么、点击或键盘激活提交什么。
4. 验证 focus 至少与 hover 一样清楚。
5. 验证 active、selected、disabled、loading、error 不会互相混淆。
6. 输入可反向时，确认进入过程可以被中断或反向。
7. 确认退出不慢于进入。
8. 确认 reduced motion 和 reduced transparency 下仍能正确理解控件。
9. 编辑前截取准确表面；编辑后同时截取 Classic 和 Liquid Glass。
10. 运行 `DESIGN.md` 和 `css-no-pingpong` 工作流要求的 CSS、visual、design
    及相关 feature gates。

## 不接受的理解方式

“让 Liquid Glass 控件现代一点”不等于允许：

- 用通用网页或移动端设计系统替换 System 6 控件；
- 把所有控件改成圆角 pills；
- 给已有 owning pane 的内容再套 glass card；
- 让无关控件一起跟随光标运动；
- 在需要实体可读表面的地方强行透明；
- 用动画掩盖延迟或暗示已经完成；
- 改变 Classic 的行为、DOM、文案或键盘语义；
- token 能表达材质时仍新增 Liquid 专属 selector twin；
- 没有双主题前后证据就调整 CSS。

目标是让熟悉的对象反馈得更精确，而不是让另一个产品披上玻璃。
