-- dotWatch Security Patch 06
-- 03_validate_constraints.sql
--
-- รันหลังจาก 02_apply_security_constraints_indexes.sql สำเร็จ
-- ใช้ validate foreign key ที่เพิ่มแบบ NOT VALID

ALTER TABLE device_metric_readings
VALIDATE CONSTRAINT fk_device_metric_readings_device;

ALTER TABLE device_metrics
VALIDATE CONSTRAINT fk_device_metrics_device;
