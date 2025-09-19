import nodemailer from 'nodemailer';
import config from '../config';
import { IShift } from '../models/Shift';
import { IEmployee } from '../models/Employee'; 
import ejs from 'ejs'; 
import path from 'path'; 
import mongoose from 'mongoose'; 

type PopulatedShiftForEmail = IShift & {
    assigned_employee: IEmployee & { email: string; name: string };
};

let transporter: nodemailer.Transporter | null = null;

// --- Initialize Transporter ---
try {
    if (config.emailService) {
        transporter = nodemailer.createTransport({
            service: config.emailService,
            auth: {
                user: config.emailUser,
                pass: config.emailPass,
            },
        });
         console.log(`>>> Nodemailer transporter configured using service: ${config.emailService}`);
    } else if (config.emailHost && config.emailUser && config.emailPass) {

         transporter = nodemailer.createTransport({
            host: config.emailHost,
            port: config.emailPort,
            secure: config.emailSecure, 
            auth: {
                user: config.emailUser,
                pass: config.emailPass,
            },
        });
         console.log(`>>> Nodemailer transporter configured using host: ${config.emailHost}`);
    } else {
        console.warn('!!! Email service not configured. Transporter not created.');
    }


    if (transporter) {
        transporter.verify((error, success) => {
            if (error) {
                console.error('!!! Nodemailer transporter verification failed:', error);
                transporter = null; 
            } else {
                console.log('>>> Nodemailer transporter verified successfully.');
            }
        });
    }

} catch (error) {
    console.error('!!! Failed to create Nodemailer transporter:', error);
    transporter = null; 
}



/**
 * Sends a schedule notification email to an employee using an EJS template.
 *
 * @param employeeEmail The recipient's email address.
 * @param employeeName The recipient's name.
 * @param shifts An array of PopulatedShiftForEmail objects assigned to the employee.
 * @param targetMonthStr String representation of the month (e.g., "May 2025").
 */
export const sendScheduleNotification = async (
    employeeEmail: string,
    employeeName: string,
    shifts: PopulatedShiftForEmail[], 
    targetMonthStr: string
): Promise<void> => {

    if (!transporter) {
        console.error(`!!! Email transporter not available. Cannot send schedule to ${employeeEmail}.`);
        return; 
    }
    if (!shifts || shifts.length === 0) {
        console.log(`No shifts to notify for ${employeeName} (${employeeEmail}). Skipping email.`);
        return;
    }

    console.log(`[Notification Service] Preparing schedule email for ${employeeName} (${employeeEmail}) for ${targetMonthStr}...`);

    try {
        const templatePath = path.join(__dirname, '../../views/email/schedule_update.ejs');
        const emailHtml = await ejs.renderFile(templatePath, {
            name: employeeName,
            shifts: shifts, 
            month: targetMonthStr
        });

        const mailOptions: nodemailer.SendMailOptions = {
            from: config.emailFrom, 
            to: employeeEmail,      
            subject: `Your Pozole Schedule for ${targetMonthStr}`, 
            html: emailHtml,        
        };

        console.log(`[Notification Service] Sending email to ${employeeEmail}...`);
        let info = await transporter.sendMail(mailOptions);
        console.log(`[Notification Service] Email sent successfully to ${employeeEmail}. Message ID: ${info.messageId}`);

    } catch (error) {
        console.error(`[Notification Service] Error rendering template or sending email to ${employeeEmail}:`, error);
    }
};