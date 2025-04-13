import { defineEventHandler, getMethod, readBody, getQuery } from 'h3';
import { getDb } from '../../utils/db';

export default defineEventHandler(async (event) => {
  const method = getMethod(event);
  
  // GET - Retrieve settings
  if (method === 'GET') {
    const query = getQuery(event);
    const { key, userId } = query;
    
    if (!key || !userId) {
      return { error: 'Missing required parameters' };
    }
    
    try {
      const db = getDb();
      
      // Check if the setting exists
      const setting = db.prepare(`
        SELECT value FROM settings 
        WHERE user_id = ? AND key = ?
      `).get(userId, key);
      
      if (setting) {
        // Parse the value if it's JSON
        try {
          return { value: JSON.parse(setting.value) };
        } catch (e) {
          // If it's not valid JSON, return as is
          return { value: setting.value };
        }
      } else {
        return { value: null };
      }
    } catch (error) {
      console.error('Error retrieving setting:', error);
      return { error: 'Failed to retrieve setting' };
    }
  }
  
  // POST - Create or update settings
  if (method === 'POST') {
    const body = await readBody(event);
    const { key, value, userId } = body;
    
    if (!key || value === undefined || !userId) {
      return { error: 'Missing required parameters' };
    }
    
    try {
      const db = getDb();
      const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;
      
      // Check if the setting already exists
      const existing = db.prepare(`
        SELECT id FROM settings 
        WHERE user_id = ? AND key = ?
      `).get(userId, key);
      
      if (existing) {
        // Update existing setting
        db.prepare(`
          UPDATE settings 
          SET value = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE user_id = ? AND key = ?
        `).run(stringValue, userId, key);
      } else {
        // Insert new setting
        db.prepare(`
          INSERT INTO settings (user_id, key, value, created_at, updated_at) 
          VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(userId, key, stringValue);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error saving setting:', error);
      return { error: 'Failed to save setting' };
    }
  }
  
  // DELETE - Remove settings
  if (method === 'DELETE') {
    const query = getQuery(event);
    const { key, userId } = query;
    
    if (!key || !userId) {
      return { error: 'Missing required parameters' };
    }
    
    try {
      const db = getDb();
      
      db.prepare(`
        DELETE FROM settings 
        WHERE user_id = ? AND key = ?
      `).run(userId, key);
      
      return { success: true };
    } catch (error) {
      console.error('Error deleting setting:', error);
      return { error: 'Failed to delete setting' };
    }
  }
  
  return { error: 'Method not allowed' };
});
