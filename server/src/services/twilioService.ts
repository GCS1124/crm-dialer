import twilio from "twilio";

import { env } from "../config/env.js";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function isRealSid(value: string, prefix: "AC" | "SK" | "AP") {
  return new RegExp(`^${prefix}[a-z0-9]{16,}$`, "i").test(value.trim());
}

function isRealSecret(value: string) {
  const normalized = normalize(value);
  return (
    normalized.length >= 12 &&
    ![
      "twilio-api-secret",
      "your-api-secret",
      "replace-with-your-twilio-api-secret",
    ].includes(normalized)
  );
}

function isRealCallerId(value: string) {
  const normalized = value.trim();
  return /^\+[1-9]\d{9,14}$/.test(normalized) && normalized !== "+10000000000";
}

export function getTwilioFieldStatus() {
  return {
    accountSid: isRealSid(env.TWILIO_ACCOUNT_SID, "AC"),
    apiKey: isRealSid(env.TWILIO_API_KEY, "SK"),
    apiSecret: isRealSecret(env.TWILIO_API_SECRET),
    appSid: isRealSid(env.TWILIO_APP_SID, "AP"),
    callerId: isRealCallerId(env.TWILIO_OUTBOUND_CALLER_ID),
  };
}

export function isTwilioConfigured() {
  const fields = getTwilioFieldStatus();
  return Object.values(fields).every(Boolean);
}

export function getTwilioVoiceConfig() {
  return {
    available: isTwilioConfigured(),
    accountSid: env.TWILIO_ACCOUNT_SID,
    appSid: env.TWILIO_APP_SID,
    callerId: env.TWILIO_OUTBOUND_CALLER_ID,
  };
}

export function createVoiceAccessToken(identity: string) {
  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const token = new AccessToken(
    env.TWILIO_ACCOUNT_SID,
    env.TWILIO_API_KEY,
    env.TWILIO_API_SECRET,
    { identity },
  );

  token.addGrant(
    new VoiceGrant({
      outgoingApplicationSid: env.TWILIO_APP_SID,
      incomingAllow: false,
    }),
  );

  return token.toJwt();
}

export function buildOutboundVoiceResponse(phoneNumber: string) {
  const response = new twilio.twiml.VoiceResponse();
  response.dial(
    {
      callerId: env.TWILIO_OUTBOUND_CALLER_ID,
      answerOnBridge: true,
      record: "record-from-answer-dual",
    },
    phoneNumber,
  );

  return response.toString();
}
