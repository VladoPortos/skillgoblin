import { readdir } from 'fs/promises';
import { resolve } from 'path';

export default defineEventHandler(async (event) => {
  try {
    // Get all files in the banners directory
    const bannersDir = resolve(process.cwd(), 'public/banners');
    const files = await readdir(bannersDir);
    
    // Filter to only include image files
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const imageFiles = files.filter(file => {
      const ext = file.substring(file.lastIndexOf('.')).toLowerCase();
      return imageExtensions.includes(ext);
    });
    
    if (imageFiles.length === 0) {
      // Return default banner path if no images found
      return { path: '/logos/skillgoblin-logo-wide.png' };
    }
    
    // Select a random image from the array
    const randomIndex = Math.floor(Math.random() * imageFiles.length);
    const randomBanner = imageFiles[randomIndex];
    
    return { path: `/banners/${randomBanner}` };
  } catch (error) {
    console.error('Error fetching random banner:', error);
    // Fall back to the default logo in case of errors
    return { path: '/logos/skillgoblin-logo-wide.png' };
  }
});
