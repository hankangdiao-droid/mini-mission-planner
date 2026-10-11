# v0.1 发布准备

## 公开内容

源码、中文/英文 README、MIT 许可、依赖许可、算法与兼容性说明、虚构样例、单元和浏览器测试、CI、手动 Pages 工作流。

没有校园数据库、现场照片、模型网格、训练权重、天地图密钥或数据库密码。文件扫描只检查配置中的模式，发布前仍需人工审查。

## 推荐 GitHub 位置

自己的账号，仓库名 `mini-mission-planner`，公开仓库。简介建议：

> Local browser mission planner for DJI Mini 4 Pro and Mini 5 Pro: survey, facade and orbit routes, WPML KMZ export, flight verification pending.

Topics 建议：`dji`、`mini-4-pro`、`mini-5-pro`、`waypoints`、`wpml`、`kmz`、`vue`、`drone-inspection`。

当前连接账号为 `hankangdiao-droid`，尚无可访问的目标仓库。连接工具不支持新建仓库。由账号所有者在 GitHub 新建 `mini-mission-planner` 空仓库，并确保 GitHub 连接具有访问权限后，再上传。只上传源码和虚构样例，不上传 `.local`、`node_modules`、个人任务或带密钥的配置。

本地代码已提交时，可通过具有该仓库写权限的 Git 环境推送：

```sh
git remote add origin https://github.com/hankangdiao-droid/mini-mission-planner.git
git push -u origin main
```

如果已存在 origin，先检查地址，不重复添加或强制覆盖远端。上述命令只在仓库已创建、权利归属确认且决定正式发布后执行。上传源码不会自动发布 Pages，Pages 工作流仍需手动运行。

## 发布步骤

1. 复查代码及文档，确认公开仓库、账号、MIT 许可和项目名。确认源自裂察者的模块可公开，涉及共同作者、学校或合作单位权益时先取得相应授权。
2. 新建空仓库，不勾选自动 README / .gitignore / license。推送本地代码。
3. Actions 中检查 CI。Settings → Pages → Build and deployment 选择 GitHub Actions。
4. 源码发布后可选手动运行 Pages 工作流。地名搜索默认未配置，用户需配置授权服务。多人站点须核查底图及查询服务条款，客户端节流不能代替整体限流。首页保留两机型独立版均待实飞验证的说明。
5. 原生任务解析与短任务实飞完成后补兼容性矩阵，再决定是否发布稳定版。

## 后续优先级

P0：Mini 4 Pro 和 Mini 5 Pro 的本机原生任务对照、版本矩阵、空旷场地短任务验证。

P1：在得到真机证据后完善模板结构、转弯及照片停留动作，加入每架次起降耗时和分段电量提示。

P2：可选公开 DEM / 三维网格避障、距离/GSD 目标规划、覆盖率回放。原裂察者后台功能不能无边界照搬为客户端保证。
