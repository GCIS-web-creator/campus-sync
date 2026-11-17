-- Restrict book cover images to 5 MB and safe image formats.
update storage.buckets
set file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']::text[]
where id = 'book - images';
