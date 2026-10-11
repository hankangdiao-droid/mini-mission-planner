# v0.1 发布准备

## 公开内容

源码、中文/英文 README、MIT 许可、依赖许可、算法与兼容性说明、虚构样例、单元和浏览器测试、CI、手动 Pages 工作流。

没有校园数据库、现场照片、模型网格、训练权重、天地图密钥或数据库密码。文件扫描只检查配置中的模式，发布前仍需人工审查。

## 推荐 GitHub 位置

自己的账号，仓库名 `mini-mission-planner`，公开仓库。简介建议：

> Local browser mission planner for DJI Mini 4 Pro and Mini 5 Pro: survey, facade and orbit routes, WPML KMZ export, flight verification pending.

Topics 建议：`dji`、`mini-4-pro`、`mini-5-pro`、`waypoints`、`wpml`、`kmz`、`vue`、`drone-inspection`。

## 发布步骤

1. 复查代码及文档，确认公开仓库、账号、MIT 许可和项目名。
2. 新建空仓库，不勾选自动 README / .gitignore / license。推送本地代码。
3. Actions 中检查 CI。Settings → Pages → Build and deployment 选择 GitHub Actions。
4. 手动运行 Pages 工作流。发布技术预览，首页注明两机型独立版均待实飞验证。
5. 原生任务解析与短任务实飞完成后补兼容性矩阵，再决定是否发布稳定版。

## 后续优先级

P0：Mini 4 Pro 和 Mini 5 Pro 的本机原生任务对照、版本矩阵、空旷场地短任务验证。

P1：在得到真机证据后完善模板结构、转弯及照片停留动作，加入每架次起降耗时和分段电量提示。

P2：可选公开 DEM / 三维网格避障、距离/GSD 目标规划、覆盖率回放。原裂察者后台功能不能无边界照搬为客户端保证。
