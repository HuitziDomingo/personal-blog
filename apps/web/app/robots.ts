import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/config';
import { robotsConfig } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return robotsConfig(siteUrl(), process.env);
}
