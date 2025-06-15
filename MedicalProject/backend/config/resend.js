import * as brevo from '@getbrevo/brevo';

// 🔧 DIGITAL OCEAN: Hardcoded Brevo configuration
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_FROM_EMAIL = 'pawrangerskyler@gmail.com';
const FROM_NAME = 'StarRadiology';

console.log('🔧 [DIGITAL OCEAN] Initializing Brevo with hardcoded values...');
console.log('📧 From email:', BREVO_FROM_EMAIL);
console.log('👤 From name:', FROM_NAME);

// Initialize Brevo API
const apiInstance = new brevo.TransactionalEmailsApi();
apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, BREVO_API_KEY);

// 🔧 BREVO: Create transporter-like interface
const transporter = {
    async sendMail(options) {
        try {
            console.log('📤 [DIGITAL OCEAN] Sending email via Brevo...');
            console.log('📧 To:', options.to);
            console.log('📋 Subject:', options.subject);
            
            // 🔧 FIXED: Ensure name is properly provided for Brevo
            const recipientName = options.name || options.to.split('@')[0] || 'User';
            
            // 🔧 BREVO: Prepare email data with hardcoded values
            const emailData = {
                sender: {
                    name: FROM_NAME,
                    email: BREVO_FROM_EMAIL
                },
                to: [{
                    email: options.to,
                    name: recipientName
                }],
                subject: options.subject,
                htmlContent: options.html
            };

            console.log('📧 [DIGITAL OCEAN] Sending with Brevo data:', {
                from: emailData.sender,
                to: emailData.to,
                subject: emailData.subject
            });

            // 🔧 BREVO: Send email
            const result = await apiInstance.sendTransacEmail(emailData);
            
            console.log('✅ [DIGITAL OCEAN] Email sent successfully via Brevo');
            console.log('📧 Brevo Response:', JSON.stringify(result, null, 2));
            
            // 🔧 BREVO: Return standardized response
            return {
                success: true,
                id: result?.messageId || result?.response?.messageId,
                messageId: result?.messageId || result?.response?.messageId,
                data: result,
                response: result
            };
            
        } catch (error) {
            console.error('❌ [DIGITAL OCEAN] Brevo email error:', error);
            console.error('❌ Error details:', {
                message: error.message,
                name: error.name,
                status: error.status || error.statusCode,
                body: error.body
            });
            throw error;
        }
    }
};

export default transporter;