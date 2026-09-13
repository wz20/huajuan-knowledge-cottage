# v13 环境动效来源

实际读取参考工程 `sooahs-room-folio-main/src/main.js` 的 Smoke Shader setup（1134–1157）、杯子位置绑定（1516附近）、悬停烟雾缩放（1714附近），以及 `src/shaders/smoke/vertex.glsl` / `fragment.glsl`。

参考实现思路是：细分竖直平面、透明且不写深度、随时间扭动、从下至上滚动噪声、边缘渐隐。参考项目由 Andrew Woan 以 MIT 发布；原仓库版权声明保留于现有 `v8-reference-MIT-LICENSE.md`。

本次 `AmbientMotion.ts` 独立编写了双细缕 shader，以数学值噪声代替参考 `perlin.png`，没有复制任何原贴图或第三方付费材质。蒸汽锚点从实际 `DrinkingCupMotion` 子网格边界计算，随真实杯口移动；朝向遵循 WorkFace 局部向外重力。没有平面大白圆粒子、没有额外图片生成。

减少动态、空间翻转与非工作面时隐藏蒸汽并暂停其时钟。蒸汽不参加射线拾取；资源随模块 dispose 清理。椅子／风扇只按场景 metadata 在原有几何上施加小角度／旋转，并提供恢复静止姿态的射线查询入口，防止悬停抖动。
