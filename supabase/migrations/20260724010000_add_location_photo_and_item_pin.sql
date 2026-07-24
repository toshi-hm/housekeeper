alter table storage_locations add column if not exists photo_path text;

alter table items add column if not exists pin_x numeric(4,3);
alter table items add column if not exists pin_y numeric(4,3);

alter table items add constraint items_pin_x_range check (pin_x is null or (pin_x >= 0 and pin_x <= 1));
alter table items add constraint items_pin_y_range check (pin_y is null or (pin_y >= 0 and pin_y <= 1));
