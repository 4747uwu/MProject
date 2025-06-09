import { useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import radiantApi from '../services/RadiantApiService';

export const useRadiantLaunch = () => {
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchStatus, setLaunchStatus] = useState(null);

  // 🔧 FIXED: Use RadiantApiService instead of direct fetch
  const checkHelperStatus = useCallback(async (clientIp = null) => {
    try {
      console.log(`🔍 [useRadiantLaunch] Checking helper status via RadiantApiService`);
      console.log(`📍 Client IP provided: ${clientIp}`);
      
      // 🔧 FIX: Use the RadiantApiService which has environment variables
      const result = await radiantApi.checkHelperStatus(clientIp);
      console.log('✅ [useRadiantLaunch] RadiantApiService result:', result);
      
      return result;
    } catch (error) {
      console.error('❌ [useRadiantLaunch] RadiantApiService check failed:', error);
      return {
        success: false,
        error: error.message,
        data: { isRunning: false }
      };
    }
  }, []);

  // 🔧 Test connection using RadiantApiService
  const testConnection = useCallback(async (clientIp = null) => {
    try {
      console.log(`🧪 [useRadiantLaunch] Testing connection via RadiantApiService`);
      const result = await radiantApi.testClientConnection(clientIp);
      
      if (result.success) {
        toast.success(`✅ Connection successful to RadiAnt Helper`);
      } else {
        toast.error(`❌ Connection failed to RadiAnt Helper`);
      }
      
      return result;
    } catch (error) {
      console.error('❌ [useRadiantLaunch] Connection test failed:', error);
      toast.error(`❌ Connection test failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }, []);

  // 🔧 Launch study using RadiantApiService
  const launchStudy = useCallback(async (study, options = {}) => {
    const {
      clientIp = null,
      showProgress = true,
      showSuccess = true,
      showError = true,
    } = options;

    setIsLaunching(true);
    setLaunchStatus('preparing');

    try {
      if (!study.orthancStudyID) {
        throw new Error('Orthanc Study ID not found - cannot launch RadiAnt');
      }

      if (showProgress) {
        toast.loading('🚀 Launching RadiAnt Viewer...', {
          id: 'radiant-launch',
          duration: 60000
        });
      }

      setLaunchStatus('launching');

      // 🔧 Use RadiantApiService for launch
      console.log(`🚀 [useRadiantLaunch] Launching via RadiantApiService`);
      const formattedStudy = radiantApi.formatStudyDataForLaunch(study);
      const result = await radiantApi.launchStudyByOrthancId(
        study.orthancStudyID, 
        formattedStudy, 
        clientIp
      );

      setLaunchStatus('success');

      if (showSuccess) {
        toast.success('✅ RadiAnt Viewer launched successfully!', {
          id: 'radiant-launch',
          duration: 3000
        });
      }

      return result;

    } catch (error) {
      console.error('❌ [useRadiantLaunch] Launch failed:', error);
      setLaunchStatus('error');

      if (showError) {
        toast.error(`❌ Failed to launch RadiAnt: ${error.message}`, {
          id: 'radiant-launch',
          duration: 5000
        });
      }

      return {
        success: false,
        error: error.message
      };
    } finally {
      setIsLaunching(false);
    }
  }, []);

  // 🔧 Get connection info from RadiantApiService
  const getConnectionInfo = useCallback(() => {
    return radiantApi.getDefaultConnectionInfo();
  }, []);

  return {
    isLaunching,
    launchStatus,
    launchStudy,
    checkHelperStatus,
    testConnection,
    getConnectionInfo
  };
};