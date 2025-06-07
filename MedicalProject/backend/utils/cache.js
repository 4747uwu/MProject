class SimpleCache {
    constructor() {
        this.cache = new Map();
        this.ttlMap = new Map(); // Store TTL timestamps
        
        // Clean up expired entries every 5 minutes
        setInterval(() => {
            this.cleanup();
        }, 5 * 60 * 1000);
    }

    // 🔧 Set cache with optional TTL (time to live in seconds)
    set(key, value, ttlSeconds = 300) { // Default 5 minutes
        const expiresAt = Date.now() + (ttlSeconds * 1000);
        
        this.cache.set(key, value);
        this.ttlMap.set(key, expiresAt);
        
        console.log(`📦 Cache SET: ${key} (expires in ${ttlSeconds}s)`);
        return true;
    }

    // 🔧 Get cache value
    get(key) {
        const expiresAt = this.ttlMap.get(key);
        
        // Check if expired
        if (expiresAt && Date.now() > expiresAt) {
            this.delete(key);
            console.log(`⏰ Cache EXPIRED: ${key}`);
            return null;
        }
        
        const value = this.cache.get(key);
        if (value !== undefined) {
            console.log(`✅ Cache HIT: ${key}`);
            return value;
        }
        
        console.log(`❌ Cache MISS: ${key}`);
        return null;
    }

    // 🔧 Delete cache entry
    delete(key) {
        const existed = this.cache.has(key);
        this.cache.delete(key);
        this.ttlMap.delete(key);
        
        if (existed) {
            console.log(`🗑️ Cache DELETE: ${key}`);
        }
        
        return existed;
    }

    // 🔧 Delete multiple cache entries (alias: del)
    del(key) {
        return this.delete(key);
    }

    // 🔧 Clear all cache
    clear() {
        const size = this.cache.size;
        this.cache.clear();
        this.ttlMap.clear();
        console.log(`🧹 Cache CLEARED: ${size} entries removed`);
        return true;
    }

    // 🔧 Check if key exists
    has(key) {
        const expiresAt = this.ttlMap.get(key);
        
        // Check if expired
        if (expiresAt && Date.now() > expiresAt) {
            this.delete(key);
            return false;
        }
        
        return this.cache.has(key);
    }

    // 🔧 Get cache size
    size() {
        return this.cache.size;
    }

    // 🔧 Get all cache keys
    keys() {
        return Array.from(this.cache.keys());
    }

    // 🔧 Get cache statistics
    stats() {
        const now = Date.now();
        let expiredCount = 0;
        let validCount = 0;
        
        for (const [key, expiresAt] of this.ttlMap) {
            if (now > expiresAt) {
                expiredCount++;
            } else {
                validCount++;
            }
        }
        
        return {
            totalEntries: this.cache.size,
            validEntries: validCount,
            expiredEntries: expiredCount,
            memoryUsage: this.getMemoryUsage()
        };
    }

    // 🔧 Get memory usage (rough estimate)
    getMemoryUsage() {
        let totalSize = 0;
        
        for (const [key, value] of this.cache) {
            totalSize += this.estimateSize(key) + this.estimateSize(value);
        }
        
        return {
            bytes: totalSize,
            kb: Math.round(totalSize / 1024),
            mb: Math.round(totalSize / (1024 * 1024))
        };
    }

    // 🔧 Estimate object size in bytes
    estimateSize(obj) {
        if (obj === null || obj === undefined) return 0;
        
        if (typeof obj === 'string') {
            return obj.length * 2; // Rough estimate for UTF-16
        }
        
        if (typeof obj === 'number') {
            return 8; // 64-bit number
        }
        
        if (typeof obj === 'boolean') {
            return 4;
        }
        
        if (Array.isArray(obj)) {
            return obj.reduce((size, item) => size + this.estimateSize(item), 0);
        }
        
        if (typeof obj === 'object') {
            return Object.entries(obj).reduce((size, [key, value]) => {
                return size + this.estimateSize(key) + this.estimateSize(value);
            }, 0);
        }
        
        return JSON.stringify(obj).length * 2; // Fallback
    }

    // 🔧 Clean up expired entries
    cleanup() {
        const now = Date.now();
        let cleanedCount = 0;
        
        for (const [key, expiresAt] of this.ttlMap) {
            if (now > expiresAt) {
                this.cache.delete(key);
                this.ttlMap.delete(key);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`🧹 Cache cleanup: ${cleanedCount} expired entries removed`);
        }
    }

    // 🔧 Get or set pattern (cache-aside pattern)
    async getOrSet(key, fetchFunction, ttlSeconds = 300) {
        // Try to get from cache first
        const cached = this.get(key);
        if (cached !== null) {
            return cached;
        }
        
        // If not in cache, fetch the data
        console.log(`🔄 Cache FETCH: ${key}`);
        try {
            const data = await fetchFunction();
            this.set(key, data, ttlSeconds);
            return data;
        } catch (error) {
            console.error(`❌ Cache FETCH ERROR: ${key}`, error);
            throw error;
        }
    }

    // 🔧 Cache with tags for group invalidation
    setWithTags(key, value, tags = [], ttlSeconds = 300) {
        this.set(key, value, ttlSeconds);
        
        // Store reverse mapping for tags
        if (!this.tagMap) {
            this.tagMap = new Map();
        }
        
        tags.forEach(tag => {
            if (!this.tagMap.has(tag)) {
                this.tagMap.set(tag, new Set());
            }
            this.tagMap.get(tag).add(key);
        });
        
        return true;
    }

    // 🔧 Invalidate all cache entries with specific tags
    invalidateByTags(tags) {
        if (!this.tagMap) return 0;
        
        let invalidatedCount = 0;
        const keysToDelete = new Set();
        
        tags.forEach(tag => {
            const keys = this.tagMap.get(tag);
            if (keys) {
                keys.forEach(key => keysToDelete.add(key));
                this.tagMap.delete(tag);
            }
        });
        
        keysToDelete.forEach(key => {
            if (this.delete(key)) {
                invalidatedCount++;
            }
        });
        
        console.log(`🔄 Cache invalidated by tags [${tags.join(', ')}]: ${invalidatedCount} entries`);
        return invalidatedCount;
    }
}

// Create singleton instance
const cache = new SimpleCache();

export default cache;