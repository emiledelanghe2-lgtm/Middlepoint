alter table testimonials add column if not exists rating integer;

alter table testimonials add constraint testimonials_rating_check check (rating between 1 and 5);

update testimonials set rating = 5 where rating is null;

alter table testimonials alter column rating set default 5;
alter table testimonials alter column rating set not null;
