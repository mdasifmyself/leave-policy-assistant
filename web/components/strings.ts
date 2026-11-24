// Interface text. The assistant's answers come from the server, not from here.
// Every line earns its place: it tells the reader what this is, what to do, or what happened.
export type Tone = "answer" | "unknown" | "privacy";
type Starter = { label: string; q: string; tone: Tone };

const en = {
  appName: "Leave Policy Assistant",
  subtitle: "Sample company policy",
  how: "How it works",
  // tells the visitor the scope before anything else
  scopeLine: "Sample Northfield Trading Leave Policy · HR-POL-001 v1.0",
  title: "Ask about leave.",
  lead: "Every answer comes from the sample policy and shows the section it is based on.",
  tryAsking: "Try one of these",
  // one row per kind of reply, so a visitor can try all three in seconds
  starters: [
    { label: "Answer with its policy section", q: "Can I take 12 days of Annual Leave in a row?", tone: "answer" },
    { label: "Outside the policy, so HR will help", q: "Is there a meal allowance?", tone: "unknown" },
    { label: "Another employee's data stays confidential", q: "How many leave days has Rahim taken?", tone: "privacy" },
  ] as Starter[],
  voiceHint: "You can also tap the microphone and ask in English or Bangla.",
  spoken: "Asked by voice",
  editAsk: "Edit and ask again",
  checking: "Reading the policy",
  retry: "Try again",
  newChat: "New conversation",
  listening: "Listening… tap the square when you finish",
  cancel: "Cancel",
  transcribing: "Turning your voice into text",
  speaking: "Reading the answer aloud",
  stopSpeaking: "Stop",
  dismiss: "OK",
  placeholder: "Ask a question about leave",
  stopRecording: "Finish recording",
  askByVoice: "Ask by voice",
  send: "Send",
  fineprint: "Demo on a sample policy. Please use example details only.",
  builtBy: "Built by",
  errorGeneric: "The answer service is busy for a moment. Please try again.",
  voiceFailed: "Voice is resting for a moment. Typing works perfectly in the meantime.",
  status: {
    answer: "From the policy",
    unknown: "HR will help with this",
    privacy: "Kept confidential",
    out_of_scope: "I help with leave policy questions",
    greeting: "",
  },
  source: "Source",
  sources: "Sources",
  section: "Section",
  englishOnly: "Shown in English for full accuracy.",
  listen: "Listen",
  stop: "Stop",
  copy: "Copy",
  copied: "Copied",
  about: "About",
  emailHR: "Email HR",
  hrNote: "Policy section 14.3",
};

const bn: typeof en = {
  ...en,
  how: "কীভাবে কাজ করে",
  title: "ছুটি নিয়ে প্রশ্ন করুন।",
  lead: "প্রতিটি উত্তর আসে নমুনা নীতিমালা থেকে, আর দেখায় কোন সেকশনের ভিত্তিতে উত্তরটি দেওয়া।",
  tryAsking: "এগুলোর একটি দিয়ে শুরু করুন",
  starters: [
    { label: "নীতিমালার সেকশনসহ উত্তর", q: "আমি কি টানা ১২ দিন বার্ষিক ছুটি নিতে পারি?", tone: "answer" },
    { label: "নীতিমালার বাইরে, তাই HR সাহায্য করবে", q: "খাবার ভাতা (meal allowance) আছে কি?", tone: "unknown" },
    { label: "অন্য কর্মীর তথ্য গোপন থাকে", q: "রহিম কত দিন ছুটি নিয়েছে?", tone: "privacy" },
  ],
  voiceHint: "মাইক্রোফোনে চাপ দিয়ে বাংলা বা ইংরেজিতে মুখেও প্রশ্ন করতে পারেন।",
  spoken: "ভয়েসে জিজ্ঞাসা",
  editAsk: "ঠিক করে আবার জিজ্ঞেস করুন",
  checking: "নীতিমালা দেখা হচ্ছে",
  retry: "আবার চেষ্টা করুন",
  newChat: "নতুন কথোপকথন",
  listening: "শুনছি… শেষ হলে চারকোনা বোতামে চাপুন",
  cancel: "বাতিল",
  transcribing: "আপনার কথা লেখায় রূপান্তর হচ্ছে",
  speaking: "উত্তর পড়ে শোনানো হচ্ছে",
  stopSpeaking: "থামান",
  placeholder: "ছুটি নিয়ে প্রশ্ন লিখুন",
  stopRecording: "রেকর্ডিং শেষ করুন",
  askByVoice: "ভয়েসে জিজ্ঞেস করুন",
  send: "পাঠান",
  fineprint: "নমুনা নীতিমালার ডেমো। অনুগ্রহ করে শুধু উদাহরণ তথ্য ব্যবহার করুন।",
  errorGeneric: "উত্তর দেওয়ার সেবাটি এক মুহূর্তের জন্য ব্যস্ত। অনুগ্রহ করে আবার চেষ্টা করুন।",
  voiceFailed: "ভয়েস এই মুহূর্তে বিশ্রামে আছে। ততক্ষণ লিখে প্রশ্ন করতে পারেন।",
  status: {
    answer: "নীতিমালা থেকে",
    unknown: "এ বিষয়ে HR সাহায্য করবে",
    privacy: "গোপনীয় রাখা হয়",
    out_of_scope: "আমি ছুটির নীতিমালা নিয়ে সাহায্য করি",
    greeting: "",
  },
  source: "সূত্র",
  sources: "সূত্র",
  section: "সেকশন",
  englishOnly: "সম্পূর্ণ নির্ভুলতার জন্য ইংরেজিতে দেখানো হলো।",
  listen: "শুনুন",
  stop: "থামান",
  copy: "কপি",
  copied: "কপি হয়েছে",
  about: "বিষয়",
  emailHR: "HR-কে ইমেইল করুন",
  hrNote: "নীতিমালার সেকশন ১৪.৩",
};

export const T = { en, bn };

// The HR contact named in the sample policy, Section 14.3.
export const HR_EMAIL = "hr@northfield-trading.example";
export const BUILDER_URL = "https://asifmyself.xyz";
