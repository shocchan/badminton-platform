import { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import type { BlogPost } from '../types';

export const useBlogPosts = (options?: { includeScheduled?: boolean }) => {
  const includeScheduled = options?.includeScheduled ?? false;
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBlogPosts = async () => {
    setLoading(true);
    let query = supabase
      .from('blog_posts')
      .select('*')
      .order('published_at', { ascending: false });

    // 公開ページでは published_at が現在以前の記事のみ表示
    if (!includeScheduled) {
      query = query.lte('published_at', new Date().toISOString());
    }

    const { data, error } = await query;

    if (error) {
      setError(error.message);
    } else {
      setBlogPosts(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBlogPosts();
  }, []);

  const createPost = async (postData: Omit<BlogPost, 'id' | 'created_at' | 'updated_at'>) => {
    const { data, error } = await supabase
      .from('blog_posts')
      .insert([postData])
      .select()
      .single();

    if (error) throw error;
    await fetchBlogPosts();
    return data;
  };

  const updatePost = async (id: number, postData: Partial<BlogPost>) => {
    const { data, error } = await supabase
      .from('blog_posts')
      .update({ ...postData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    await fetchBlogPosts();
    return data;
  };

  const deletePost = async (id: number) => {
    const { error } = await supabase
      .from('blog_posts')
      .delete()
      .eq('id', id);

    if (error) throw error;
    await fetchBlogPosts();
  };

  return { blogPosts, loading, error, createPost, updatePost, deletePost, refetch: fetchBlogPosts };
};

export const useBlogPost = (id: number) => {
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPost = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        setError(error.message);
      } else {
        setPost(data);
      }
      setLoading(false);
    };

    if (id) fetchPost();
  }, [id]);

  return { post, loading, error };
};
