@echo off
title ISEU 课表 - GitHub 部署工具
cd /d "%~dp0"
echo ============================================
echo   ISEU 硕士课程表 - GitHub 一键部署
echo ============================================
echo.
echo 步骤 1: 确保有 GitHub 账号并登录
echo.
echo 步骤 2: 在浏览器打开以下链接创建新仓库：
echo   https://github.com/new
echo.
echo   仓库名: iseu-schedule
echo   可见性: Public
echo   勾选: Add a README file (不要勾)
echo.
echo 步骤 3: 把本文件夹所有文件上传到仓库
echo.
echo 步骤 4: 进入 Settings ^> Pages
echo   Source: Deploy from a branch
echo   Branch: main, / (root)
echo   点 Save
echo.
echo 步骤 5: 等待2分钟，访问：
echo   https://你的用户名.github.io/iseu-schedule/
echo.
echo ============================================
echo 更简单的办法：用 GitHub Desktop
echo 1. 安装 GitHub Desktop
echo 2. 拖入本文件夹
echo 3. 点 Publish repository
echo ============================================
pause
