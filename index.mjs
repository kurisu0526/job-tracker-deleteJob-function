import jwt from 'jsonwebtoken';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
    DynamoDBDocumentClient,
    UpdateCommand
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'job-tracker';

const USER_PREFIX = 'USER#';
const JOB_PREFIX = 'JOB#';

/**
 * Auth helper
 */
function authenticate(event) {
    const token = event.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
        throw new Error('Missing auth token');
    }

    return jwt.verify(token, process.env.JWT_SECRET);
}

export const handler = async (event) => {
    try {
        const user = authenticate(event);
        const userId = user.userId;

        const jobId = event.pathParameters?.id;

        if (!jobId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Job id is required'
                })
            };
        }

        const now = new Date().toISOString();

        // 1. Soft delete instead of removing item
        await docClient.send(
            new UpdateCommand({
                TableName: TABLE_NAME,
                Key: {
                    pk: `${USER_PREFIX}${userId}`,
                    sk: `${JOB_PREFIX}${jobId}`
                },

                UpdateExpression:
                    'SET isDeleted = :deleted, deletedAt = :now, updatedAt = :now',

                ExpressionAttributeValues: {
                    ':deleted': true,
                    ':now': now
                },

                // ensures item exists
                ConditionExpression: 'attribute_exists(pk)'
            })
        );

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Job removed successfully',
                jobId,
                deletedAt: now
            })
        };

    } catch (err) {
        if (err.name === 'ConditionalCheckFailedException') {
            return {
                statusCode: 404,
                body: JSON.stringify({
                    message: 'Job not found'
                })
            };
        }

        return {
            statusCode: 401,
            body: JSON.stringify({
                message: err.message || 'Unauthorized'
            })
        };
    }
};