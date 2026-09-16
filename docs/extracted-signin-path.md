# 从 UBAA 仓库提取出的课程签到链路

核心是 iclass，而不是 UBAA 端口。

## 服务端版链路

- `SigninRoutes.kt`
  - `GET /api/v1/signin/today`
  - `POST /api/v1/signin/do?courseId=...`
- `SigninService.kt`
  - `getTodayClasses(studentId)`
  - `performSignin(studentId, courseId)`
- `SigninClient.kt`
  - 登录：`https://iclass.buaa.edu.cn:8347/app/user/login.action`
  - 查当天课堂：`https://iclass.buaa.edu.cn:8347/app/course/get_stu_course_sched.action`
  - 服务器时间：`http://iclass.buaa.edu.cn:8081/app/common/get_timestamp.action`
  - 提交签到：`http://iclass.buaa.edu.cn:8081/app/course/stu_scan_sign.action`

## 本工具如何独立化

UBAA 服务端做了两件事：

1. 作为你登录态的代理/中转。
2. 包装 iclass 上游 API 成 `/api/v1/signin/...`。

本工具去掉第 2 层包装，直接实现 iclass 登录、查课、提交。

课前触发现在也来自 iclass 当天远程课表。工具先查询 `get_stu_course_sched.action`，拿到课堂的 `courseSchedId`、开始时间、结束时间和签到状态，再在课前窗口到课程结束前尝试提交签到。
