# 兼容性和来源

| 项目 | Mini 4 Pro | Mini 5 Pro |
| --- | --- | --- |
| FOV | 82.1° | 84° |
| 可控云台俯仰 | -90° 到 +60° | -90° 到 +55° |
| 工具速度上限 | 12 m/s | 12 m/s，保守策略 |
| 默认 WPML 命名空间 | 1.0.6，社区参考 | 1.0.5，原系统参考 |
| 默认 drone / payload enum | 68 / 68 | 68 / 68 |
| 本独立版原生任务解析验证 | 未完成 | 未完成 |
| 本独立版真机实飞 | 未完成 | 未完成 |

默认枚举只作为起点。即使两个默认值相同，也不能推导两款机型格式完全一致。可从本机 DJI Fly 原生任务提取命名空间、drone/payload 及 sub enum，再导出自己的规划。此校准不自动认证机型，不能消除固件差异。

原裂察者 Mini 5 Pro 的航线与遥控器导入有历史实飞经验，未留完整固件版本矩阵。本版本更改了失联策略、导出器和规划器，所以不沿用“已验证”标签。

## 一手资料

- [DJI Mini 4 Pro 规格](https://www.dji.com/mini-4-pro/specs)：FOV 和云台可控范围。
- [DJI Mini 5 Pro 规格](https://www.dji.com/au/mini-5-pro/specs)：FOV 和云台可控范围。
- [DJI Fly 航点飞行指南](https://repair.dji.com/help/content?customId=01700007343&documentType=&lang=zh-CN&paperDocType=ARTICLE&re=CN&spaceId=17)：机型支持、相对高度、一般 200 点限制、曲线轨迹、无断点续飞、无一般 KML 导入。
- [DJI WPML 文档](https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/dji-wpml/waylines-wpml.html)：公开协议结构。公开 Cloud API 文档不是消费级 DJI Fly 兼容性承诺。
- [jedrula/dji-waypoints](https://github.com/jedrula/dji-waypoints)、[dronnix-io/FlyPath](https://github.com/dronnix-io/FlyPath)：作者提供的消费级任务格式参考。属于社区证据。

## 实飞反馈需要记录

1. 飞机型号、固件版本、遥控器型号和固件、DJI Fly 版本。
2. 脱敏原生任务结构，枚举、命名空间和高度模式。
3. 导入后 DJI Fly 截图，对比点数、高度、速度、俯仰、拍照及返航行为。
4. 空旷场地 2–5 点短任务实飞结果，再测试 20 点，最后测试分段。
5. 确认安全人员、现场许可及手动接管条件后再扩展到贴墙巡检。

发布时可以称“支持配置和生成任务”，不能称“两款机型全面实飞验证”。
