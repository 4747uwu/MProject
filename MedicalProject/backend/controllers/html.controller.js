import HTMLTemplate from '../models/TemplateModal.js';

class HTMLTemplateController {
  
  // Get all HTML templates
  static async getTemplates(req, res) {
    try {
      const { 
        category, 
        search, 
        page = 1, 
        limit = 20,
        sortBy = 'updatedAt',
        sortOrder = 'desc'
      } = req.query;

      // Build filter
      const filter = { isActive: true };
      
      if (category && category !== 'all') {
        filter.category = category;
      }
      
      if (search) {
        filter.$or = [
          { title: { $regex: search, $options: 'i' } },
          { htmlContent: { $regex: search, $options: 'i' } }
        ];
      }

      // Execute query with pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const sortObj = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

      const [templates, totalCount] = await Promise.all([
        HTMLTemplate.find(filter)
          .select('title category htmlContent createdBy updatedAt')
          .populate('createdBy', 'fullName email')
          .sort(sortObj)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        HTMLTemplate.countDocuments(filter)
      ]);

      res.json({
        success: true,
        data: {
          templates,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(totalCount / parseInt(limit)),
            total: totalCount,
            limit: parseInt(limit)
          }
        }
      });

    } catch (error) {
      console.error('Error fetching HTML templates:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch templates',
        error: error.message
      });
    }
  }

  // Get single template by ID
  static async getTemplate(req, res) {
    try {
      const { templateId } = req.params;

      const template = await HTMLTemplate.findById(templateId)
        .populate('createdBy', 'fullName email')
        .lean();

      if (!template) {
        return res.status(404).json({
          success: false,
          message: 'Template not found'
        });
      }

      res.json({
        success: true,
        data: template
      });

    } catch (error) {
      console.error('Error fetching template:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch template',
        error: error.message
      });
    }
  }

  // Create new HTML template
  static async createTemplate(req, res) {
    try {
      const userId = req.user.id;
      const { title, category, htmlContent } = req.body;

      // Validate required fields
      if (!title || !category || !htmlContent) {
        return res.status(400).json({
          success: false,
          message: 'Title, category, and HTML content are required'
        });
      }

      // Check for duplicate title
      const existingTemplate = await HTMLTemplate.findOne({ 
        title: title.trim(),
        isActive: true 
      });

      if (existingTemplate) {
        return res.status(400).json({
          success: false,
          message: 'Template with this title already exists'
        });
      }

      // Create template
      const template = new HTMLTemplate({
        title: title.trim(),
        category,
        htmlContent,
        createdBy: userId
      });

      await template.save();
      await template.populate('createdBy', 'fullName email');

      console.log(`✅ HTML Template created: ${template.title} by ${req.user.fullName}`);

      res.status(201).json({
        success: true,
        message: 'Template created successfully',
        data: template
      });

    } catch (error) {
      console.error('Error creating HTML template:', error);
      
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'Template with this title already exists'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Failed to create template',
        error: error.message
      });
    }
  }

  // Update HTML template
  static async updateTemplate(req, res) {
    try {
      const { templateId } = req.params;
      const { title, category, htmlContent } = req.body;

      const template = await HTMLTemplate.findById(templateId);
      if (!template) {
        return res.status(404).json({
          success: false,
          message: 'Template not found'
        });
      }

      // Check if title is being changed and if it conflicts
      if (title && title.trim() !== template.title) {
        const existingTemplate = await HTMLTemplate.findOne({ 
          title: title.trim(),
          _id: { $ne: templateId },
          isActive: true 
        });

        if (existingTemplate) {
          return res.status(400).json({
            success: false,
            message: 'Template with this title already exists'
          });
        }
      }

      // Update template
      if (title) template.title = title.trim();
      if (category) template.category = category;
      if (htmlContent) template.htmlContent = htmlContent;
      
      template.updatedAt = new Date();
      
      await template.save();
      await template.populate('createdBy', 'fullName email');

      console.log(`✅ HTML Template updated: ${template.title} by ${req.user.fullName}`);

      res.json({
        success: true,
        message: 'Template updated successfully',
        data: template
      });

    } catch (error) {
      console.error('Error updating HTML template:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update template',
        error: error.message
      });
    }
  }

  // Delete template (soft delete)
  static async deleteTemplate(req, res) {
    try {
      const { templateId } = req.params;

      const template = await HTMLTemplate.findById(templateId);
      if (!template) {
        return res.status(404).json({
          success: false,
          message: 'Template not found'
        });
      }

      // Soft delete
      template.isActive = false;
      template.updatedAt = new Date();
      await template.save();

      console.log(`🗑️ HTML Template deleted: ${template.title} by ${req.user.fullName}`);

      res.json({
        success: true,
        message: 'Template deleted successfully'
      });

    } catch (error) {
      console.error('Error deleting HTML template:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete template',
        error: error.message
      });
    }
  }

  // Get categories for filter dropdown
  static async getCategories(req, res) {
    try {
      const categories = await HTMLTemplate.distinct('category', { isActive: true });
      
      res.json({
        success: true,
        data: {
          categories: categories.sort()
        }
      });

    } catch (error) {
      console.error('Error fetching categories:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch categories',
        error: error.message
      });
    }
  }

  // Get templates for reporting (grouped by category)
  static async getTemplatesForReporting(req, res) {
    try {
      const templates = await HTMLTemplate.find({ isActive: true })
        .select('title category htmlContent')
        .sort({ category: 1, title: 1 })
        .lean();

      // Group by category
      const groupedTemplates = templates.reduce((acc, template) => {
        const category = template.category;
        if (!acc[category]) {
          acc[category] = [];
        }
        
        acc[category].push({
          id: template._id,
          title: template.title,
          htmlContent: template.htmlContent
        });
        
        return acc;
      }, {});

      res.json({
        success: true,
        data: {
          templates: groupedTemplates,
          totalCount: templates.length
        }
      });

    } catch (error) {
      console.error('Error fetching templates for reporting:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch templates for reporting',
        error: error.message
      });
    }
  }




}

export default HTMLTemplateController;