
CREATE TABLE public.saved_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled Draft',
  format TEXT NOT NULL DEFAULT 'linkedinLong',
  content TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Allow public access since no auth
ALTER TABLE public.saved_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to saved_drafts" ON public.saved_drafts
  FOR ALL USING (true) WITH CHECK (true);
