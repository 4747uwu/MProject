-- notify_nodejs_on_new_study.lua

-- Configuration: Set your Node.js server's details here
-- This is CORRECT for your Node.js app running on localhost:3000
-- and your router registered at /api/orthanc
local NODEJS_PROCESS_ENDPOINT_BASE = 'http://localhost:3000/api/orthanc/studies/'
-- The script will append: {studyId} .. '/process'
-- Resulting in: http://localhost:3000/api/orthanc/studies/{studyId}/process

local HTTP_TIMEOUT_SECONDS = 10 -- Timeout for the HTTP request to Node.js

-- This function is called by Orthanc whenever a study becomes "stable"
function OnStableStudy(studyId, event)
  PrintToLog('Info', 'New stable study received: ' .. studyId)
  PrintToLog('Info', 'Attempting to notify Node.js server...')

  local targetUrl = NODEJS_PROCESS_ENDPOINT_BASE .. studyId .. '/process'
  PrintToLog('Info', 'Node.js target URL: ' .. targetUrl)

  -- Make an HTTP GET request to your Node.js endpoint
  -- Your route is a GET route: router.get('/studies/:orthancStudyId/process', ...)
  local response = LuaHttpRequest({
    url = targetUrl,
    method = 'GET', -- Matches your Node.js router.get()
    -- headers = { ['Content-Type'] = 'application/json' }, -- Not strictly needed for GET with no body
    timeout = HTTP_TIMEOUT_SECONDS
    -- For HTTPS, you might need:
    -- tls = { VerifyPeer = true, CaPath = 'C:/path/to/your/ca-bundle.crt' }
    -- or tls = { VerifyPeer = false } for testing (not recommended for production)
  })

  if response and response.ErrorCode == 0 then
    -- Check HTTP status code for success (typically 2xx)
    if response.HttpStatus >= 200 and response.HttpStatus < 300 then
      PrintToLog('Info', 'Successfully notified Node.js server for study ' .. studyId .. '. HTTP Status: ' .. response.HttpStatus)
      if response.Body and string.len(response.Body) > 0 then
        PrintToLog('Debug', 'Node.js Response Body: ' .. response.Body)
      end
    else
      PrintToLog('Error', 'Node.js server responded with non-success status for study ' .. studyId ..
                          '. HTTP Status: ' .. response.HttpStatus)
      if response.Body and string.len(response.Body) > 0 then
        PrintToLog('Error', 'Node.js Response Body: ' .. response.Body)
      end
    end
  else
    -- Handle errors from LuaHttpRequest itself (network issues, DNS, timeout before connection, etc.)
    local errorCode = response and response.ErrorCode or 'Unknown ErrorCode'
    local errorMessage = response and response.Error or 'Unknown ErrorMessage'
    local httpStatus = response and response.HttpStatus or 'N/A' -- Might not be available if ErrorCode is non-zero

    PrintToLog('Error', 'Failed to send HTTP request to Node.js server for study ' .. studyId ..
                        '. ErrorCode: ' .. tostring(errorCode) ..
                        ', ErrorMessage: ' .. errorMessage ..
                        ', HttpStatus (if any): ' .. tostring(httpStatus))
  end
end

-- This function is called when Orthanc changes state (e.g. startup, shutdown)
function OnChange(changeType, level, resourceId)
  if changeType == 0 then -- Orthanc startup (CHANGE_TYPE_ORTHANC_STARTED)
    -- Moved the global PrintToLog call here to be executed at startup
    PrintToLog('Info', 'Executing notify_nodejs_on_new_study.lua script file (startup log).')
    PrintToLog('Info', 'Node.js New Study Notifier Lua script loaded successfully.')
    PrintToLog('Info', 'Node.js process endpoint configured to: ' .. NODEJS_PROCESS_ENDPOINT_BASE .. '{studyId}/process')
  elseif changeType == 1 then -- Orthanc shutdown (CHANGE_TYPE_ORTHANC_STOPPED)
    PrintToLog('Info', 'Node.js New Study Notifier Lua script is unregistering (Orthanc stopping).')
  end
end

-- The problematic global PrintToLog call has been moved into the OnChange function above.
-- There should be no direct calls to Orthanc API functions (like PrintToLog)
-- in the global scope of the Lua script file.