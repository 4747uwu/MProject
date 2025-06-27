import DicomStudy from '../models/dicomStudyModel.js';

/**
 * Get all discussions for a study
 */
export const getStudyDiscussions = async (req, res, next) => {
  try {
    const { studyId } = req.params;
    
    const study = await DicomStudy.findOne({
      $or: [
        { _id: studyId },
        { orthancStudyID: studyId },
        { studyInstanceUID: studyId }
      ]
    });
    
    if (!study) {
      return res.status(404).json({ message: 'Study not found' });
    }
    
    return res.status(200).json(study.discussions || []);
  } catch (error) {
    next(error);
  }
};

/**
 * Add a new discussion to a study
 */
export const addStudyDiscussion = async (req, res, next) => {
  console.log(req.body)
  console.log(req.params
  )
  try {
    const { studyId } = req.params;
    const { comment, userName, userRole } = req.body;
    
    if (!comment) {
      return res.status(400).json({ message: 'Comment is required' });
    }
    
    // Find the study
    const study = await DicomStudy.findOne({
      $or: [
        { _id: studyId },
        { orthancStudyID: studyId },
        { studyInstanceUID: studyId }
      ]
    });
    
    
    if (!study) {
      return res.status(404).json({ message: 'Study not found' });
    }
    
    // Create new discussion comment using authenticated user's information
    const newDiscussion = {
      comment,
      // Use req.user for authenticated user data or fallback to provided data
      userName: req.user?.fullName || userName || 'Anonymous',
      userRole: req.user?.role || userRole || 'User',
      dateTime: new Date()
    };

    console.log(newDiscussion)
    
    // Initialize discussions array if it doesn't exist
    study.discussions = study.discussions || [];
    study.discussions.push(newDiscussion);
    
    await study.save();
   
    
    return res.status(201).json(newDiscussion);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a discussion from a study
 * Admin only function
 */
export const deleteStudyDiscussion = async (req, res, next) => {
  try {
    const { studyId, discussionId } = req.params;
    
    // Check if user has admin privileges
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized: Only admins can delete discussions' });
    }
    
    const study = await DicomStudy.findOne({
      $or: [
        { _id: studyId },
        { orthancStudyID: studyId },
        { studyInstanceUID: studyId }
      ]
    });
    
    if (!study) {
      return res.status(404).json({ message: 'Study not found' });
    }
    
    // Remove the discussion with the given ID
    if (!study.discussions) {
      return res.status(404).json({ message: 'Discussion not found' });
    }
    
    const discussionIndex = study.discussions.findIndex(
      d => d._id.toString() === discussionId
    );
    
    if (discussionIndex === -1) {
      return res.status(404).json({ message: 'Discussion not found' });
    }
    
    study.discussions.splice(discussionIndex, 1);
    await study.save();
    
    return res.status(200).json({ message: 'Discussion deleted successfully' });
  } catch (error) {
    next(error);
  }
};