// 全局物理常量（确定性模拟的基石，勿在逻辑中散落魔法数）
export const GRAV = 900;        // 重力加速度 px/s²
export const WIND_ACC = 140;    // 满风力对弹道的加速度
export const STEP = 1 / 60;     // 固定逻辑步长
export const WORLD_W = 1280;
export const WORLD_H = 720;
export const ZOOM_MUL = 1.6;    // 战斗相机拉近倍率（>1 拉近，视野=世界/ZOOM_MUL）
