import mongoose from 'mongoose';

const htmlTemplateSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Template title is required'],
    trim: true,
    unique: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: [
      'General',
      'CT',
      'CR',
      'CT SCREENING FORMAT',
      'ECHO',
      'EEG-TMT-NCS',
      'MR',
      'MRI SCREENING FORMAT',
      'PT',
      'US',
      'Other'
    ],
    index: true
  },
  
  htmlContent: {
    type: String,
    required: [true, 'HTML content is required'],
    validate: {
      validator: function(content) {
        // Basic validation to ensure it's not empty after stripping HTML
        const textContent = content.replace(/<[^>]*>/g, '').trim();
        return textContent.length > 0;
      },
      message: 'Template must contain actual content'
    }
  },
  
  // Auto-generated fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

// Index for search functionality
htmlTemplateSchema.index({ title: 'text', category: 1 });

// Virtual for content preview
htmlTemplateSchema.virtual('contentPreview').get(function() {
  const textContent = this.htmlContent.replace(/<[^>]*>/g, '').trim();
  return textContent.length > 150 ? textContent.substring(0, 150) + '...' : textContent;
});

// Ensure virtual fields are serialized
htmlTemplateSchema.set('toJSON', { virtuals: true });

export default mongoose.model('HTMLTemplate', htmlTemplateSchema);