-- 消費ログにメモ（消費理由 / 用途）を記録できるようにする (#418)
alter table consumption_logs add column note text;
