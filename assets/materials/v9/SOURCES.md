# v9 表面材质与来源

本目录 18 张 PNG 由同目录 `generate.py` 程序独立生成。没有下载纹理，没有读取原项目的贴图或材质节点。木纹、织物细纹、灰泥噪声均为确定性数学函数与固定随机种子生成，可重建。

- `oak`：浅桃橡木、弯曲山形年轮与少量细结疤轮廓，适合桌板、木架、窗框与家具。
- `floor-oak`：与家具一致的低对比山形木纹；板缝由原模型实体几何产生，贴图不绘制第二套接缝。
- `linen`、`sage-fabric`、`rose-fabric`：细织物，18 厘米重复尺度，近毫米织纹。
- `plaster`：奶油灰泥，细微粗糙表面。

每组包含 sRGB Base Color、线性 Roughness、切线空间 Normal。后处理脚本创建独立尺度 UV、标准 Principled BSDF 与显式纹理节点；PNG 被打包到 Blender，glTF 导出实际材质通道。UV 重设不会带入旧家具位置的烘焙阴影。

## 原项目授权边界

原项目 `sooahs-room-folio-main/README.md` 的 “Inspo & Credits” 明确列出 [Denis Wipart's Materials](https://wipart.artstation.com/store)，并说明作者自己持有商业许可。此声明不能证明下游用户获得该套材质的再分发授权；仓库 MIT 许可不应自动扩展覆盖这套第三方资产。因此本次复用原项目适用的网格几何，但没有使用这些第三方材质节点与贴图。本文不声称已复制原项目的原版材质。

应用中的构图、照明和阴影仍由实际运行场景产生，原项目预烘焙光照不作为改摆家具的照明使用。纹理外观需要结合实际 Electron 画面检查，不能仅凭导出成功判定质感验收。
