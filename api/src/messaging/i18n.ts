import type { Language } from "./conversation.js";

type TranslationKey =
  | "language_prompt"
  | "btn_english"
  | "btn_telugu"
  | "btn_hindi"
  | "emergency_check"
  | "btn_yes_emergency"
  | "btn_no"
  | "emergency_reply"
  | "menu_prompt"
  | "menu_title"
  | "reprompt_menu"
  | "opt_book"
  | "opt_reschedule"
  | "opt_cancel"
  | "opt_view"
  | "opt_doctors"
  | "opt_about"
  | "opt_receptionist"
  | "about_text"
  | "receptionist_text"
  | "no_doctors"
  | "our_doctors_text"
  | "ask_name"
  | "no_appointments"
  | "upcoming_appointments"
  | "choose_doctor"
  | "no_slots"
  | "choose_slot"
  | "confirm_book_prompt"
  | "btn_yes_confirm"
  | "btn_no_back"
  | "choose_appt_reschedule"
  | "choose_appt_cancel"
  | "confirm_cancel_prompt"
  | "btn_yes_cancel"
  | "btn_no_keep"
  | "reschedule_ok"
  | "reply_1_or_2"
  | "booked_success"
  | "rescheduled_success"
  | "cancelled_success"
  | "remind_24h"
  | "remind_2h"
  | "confirm_booked"
  | "confirm_rescheduled"
  | "confirm_cancelled"
  | "menu_hint"
  | "err_slot_taken"
  | "err_time_unavailable"
  | "err_generic"
  | "confirm_join_prompt"
  | "queue_joined"
  | "queue_status"
  | "queue_none"
  | "queue_arrived"
  | "queue_youre_next"
  | "queue_slip"
  | "ask_timing"
  | "btn_come_now"
  | "btn_pick_time"
  | "choose_time"
  | "confirm_scheduled_prompt"
  | "scheduled_busy_note"
  | "queue_scheduled"
  | "queue_scheduled_due";

const dict: Record<Language, Record<TranslationKey, string>> = {
  en: {
    language_prompt: "Please choose your language / దయచేసి మీ భాషను ఎంచుకోండి / कृपया अपनी भाषा चुनें",
    btn_english: "English",
    btn_telugu: "తెలుగు",
    btn_hindi: "हिंदी",
    emergency_check: "Are you experiencing a medical emergency?",
    btn_yes_emergency: "Yes",
    btn_no: "No",
    emergency_reply: "Please call 108 (or your local emergency number) immediately, or visit the nearest emergency room.\n\nFor our clinic emergency reception, tap the number to call: +919059790014",
    menu_prompt: "Hi! I'm the clinic booking assistant. Tap 'Main Menu' below to see what I can do for you — send 'menu' anytime to start over.",
    menu_title: "Main Menu",
    reprompt_menu: "Please select an option from the menu, or send 'menu' to start over.",
    opt_book: "Book appointment",
    opt_reschedule: "Reschedule",
    opt_cancel: "Cancel",
    opt_view: "My appointments",
    opt_doctors: "Our Doctors",
    opt_about: "About Hospital",
    opt_receptionist: "Talk to Reception",
    about_text: "We are ReceptionSync Clinic, providing top-notch healthcare services. We are open Monday to Saturday, 9 AM to 7 PM. Located at 123 Health Ave.",
    receptionist_text: "Our reception desk is available at +1-800-CLINIC during business hours. Please call us directly for immediate assistance.",
    no_doctors: "No doctors are currently listed.",
    our_doctors_text: "Our Doctors:",
    ask_name: "Sure — what name should the appointment be under?",
    no_appointments: "I couldn't find any appointments for this number.",
    upcoming_appointments: "Your upcoming appointments:",
    choose_doctor: "Which doctor would you like to see?",
    no_slots: "I'm sorry, there are no available slots in the next 14 days.",
    choose_slot: "Here are the next available times:",
    confirm_book_prompt: "Book {doctor} on {time}?",
    btn_yes_confirm: "Yes, confirm",
    btn_no_back: "No, back to menu",
    choose_appt_reschedule: "Which appointment would you like to reschedule?",
    choose_appt_cancel: "Which appointment would you like to cancel?",
    confirm_cancel_prompt: "Cancel your appointment with {doctor} on {time}?",
    btn_yes_cancel: "Yes, cancel it",
    btn_no_keep: "No, keep it",
    reschedule_ok: "No problem. Let's find a new time.",
    reply_1_or_2: "Please reply 1 to confirm or 2 to go back.",
    booked_success: "You're booked for {time}. See you then!",
    rescheduled_success: "Done — your appointment is now {time}.",
    cancelled_success: "Your appointment has been cancelled.",
    remind_24h: "Reminder: You have an appointment with {doctor} tomorrow at {time}.",
    remind_2h: "Reminder: Your appointment with {doctor} is in 2 hours ({time}).",
    confirm_booked: "Your appointment with {doctor} on {time} is confirmed.",
    confirm_rescheduled: "Your appointment with {doctor} has been moved to {time}.",
    confirm_cancelled: "Your appointment with {doctor} on {time} has been cancelled.",
    menu_hint: "Send 'menu' to do something else.",
    err_slot_taken: "Sorry, that time was just taken. Let's pick another.",
    err_time_unavailable: "That time isn't available anymore. Let's pick another.",
    err_generic: "Sorry, I couldn't find that. Let's start over.",
    confirm_join_prompt: "{doctor}: about {min}–{max} min wait, suggested arrival ~{arrival}. Book? Tap Yes/No.",
    queue_joined: "Booked with {doctor}. About {min}–{max} min wait — aim to arrive by {arrival}. Send 'status' anytime.",
    queue_status: "{doctor}: about {min}–{max} min wait, suggested arrival ~{arrival}.",
    queue_none: "You have no active tokens today.",
    queue_arrived: "Checked in ✓ for {doctor} — about {min}–{max} min now.",
    queue_youre_next: "You're next for {doctor}! Please be ready.",
    queue_slip: "{doctor} is running a little behind — now about {min}–{max} min.",
    ask_timing: "When would you like to come?",
    btn_come_now: "Come now",
    btn_pick_time: "Pick a time",
    choose_time: "Pick a time to come in:",
    confirm_scheduled_prompt: "{doctor}: come around {around}, please arrive by {comeBy}. It's a window, not an exact minute. Book? Tap Yes/No.",
    scheduled_busy_note: "Heads up — that time is busy, so you'll likely be seen by ~{likely}.",
    queue_scheduled: "Booked with {doctor} for around {around}. Please arrive by {comeBy} — you'll join the live queue near your time. Send 'status' anytime.",
    queue_scheduled_due: "Your turn with {doctor} is coming up — please head to the clinic now.",
  },
  te: {
    language_prompt: "Please choose your language / దయచేసి మీ భాషను ఎంచుకోండి / कृपया अपनी भाषा चुनें",
    btn_english: "English",
    btn_telugu: "తెలుగు",
    btn_hindi: "हिंदी",
    emergency_check: "మీరు వైద్యపరమైన అత్యవసర పరిస్థితిని ఎదుర్కొంటున్నారా?",
    btn_yes_emergency: "అవును",
    btn_no: "కాదు",
    emergency_reply: "దయచేసి వెంటనే 108 కు కాల్ చేయండి లేదా సమీపంలోని ఎమర్జెన్సీ ఆసుపత్రికి వెళ్లండి.\n\nమా క్లినిక్ రిసెప్షన్ కోసం కాల్ చేయడానికి నొక్కండి: +919059790014",
    menu_prompt: "నమస్కారం! నేను క్లినిక్ బుకింగ్ అసిస్టెంట్‌ని. సేవలను చూడటానికి 'Main Menu' నొక్కండి — మళ్ళీ మొదలుపెట్టడానికి 'menu' అని పంపండి.",
    menu_title: "మెను",
    reprompt_menu: "దయచేసి మెను నుండి ఒక ఎంపికను ఎంచుకోండి లేదా మళ్ళీ మొదలుపెట్టడానికి 'menu' అని పంపండి.",
    opt_book: "బుకింగ్",
    opt_reschedule: "మార్చండి",
    opt_cancel: "రద్దు చేయండి",
    opt_view: "నా బుకింగ్స్",
    opt_doctors: "మా డాక్టర్లు",
    opt_about: "ఆసుపత్రి గురించి",
    opt_receptionist: "రిసెప్షన్",
    about_text: "మేము ReceptionSync క్లినిక్, అత్యుత్తమ ఆరోగ్య సేవలను అందిస్తున్నాము. సమయాలు: సోమ-శని 9 AM నుండి 7 PM. చిరునామా: 123 Health Ave.",
    receptionist_text: "మా రిసెప్షన్ పని వేళల్లో అందుబాటులో ఉంటుంది. తక్షణ సహాయం కోసం దయచేసి మాకు కాల్ చేయండి.",
    no_doctors: "ప్రస్తుతం డాక్టర్లు అందుబాటులో లేరు.",
    our_doctors_text: "మా డాక్టర్లు:",
    ask_name: "తప్పకుండా — ఎవరి పేరు మీద అపాయింట్‌మెంట్ బుక్ చేయాలి?",
    no_appointments: "మీ నంబర్‌పై ఎలాంటి బుకింగ్స్ లేవు.",
    upcoming_appointments: "మీ రాబోయే అపాయింట్‌మెంట్‌లు:",
    choose_doctor: "మీరు ఏ డాక్టర్‌ని కలవాలనుకుంటున్నారు?",
    no_slots: "క్షమించండి, తదుపరి 14 రోజుల్లో ఖాళీ సమయాలు లేవు.",
    choose_slot: "తదుపరి అందుబాటులో ఉన్న సమయాలు:",
    confirm_book_prompt: "{doctor} గారితో {time} కి బుక్ చేయాలా?",
    btn_yes_confirm: "అవును",
    btn_no_back: "వద్దు",
    choose_appt_reschedule: "మీరు ఏ అపాయింట్‌మెంట్‌ని మార్చాలనుకుంటున్నారు?",
    choose_appt_cancel: "మీరు ఏ అపాయింట్‌మెంట్‌ని రద్దు చేయాలనుకుంటున్నారు?",
    confirm_cancel_prompt: "{doctor} గారితో {time} కి ఉన్న అపాయింట్‌మెంట్ రద్దు చేయాలా?",
    btn_yes_cancel: "అవును రద్దు చేయి",
    btn_no_keep: "వద్దు ఉంచండి",
    reschedule_ok: "సరే. కొత్త సమయం చూద్దాం.",
    reply_1_or_2: "దయచేసి నిర్ధారించడానికి 1 లేదా వెనక్కి వెళ్ళడానికి 2 అని రిప్లై ఇవ్వండి.",
    booked_success: "{time} కి మీ బుకింగ్ పూర్తయింది. అప్పుడు కలుద్దాం!",
    rescheduled_success: "పూర్తయింది — మీ అపాయింట్‌మెంట్ {time} కి మార్చబడింది.",
    cancelled_success: "మీ అపాయింట్‌మెంట్ రద్దు చేయబడింది.",
    remind_24h: "రిమైండర్: రేపు {time} కి {doctor} గారితో మీకు అపాయింట్‌మెంట్ ఉంది.",
    remind_2h: "రిమైండర్: {doctor} గారితో మీ అపాయింట్‌మెంట్ 2 గంటల్లో ({time}) ఉంది.",
    confirm_booked: "{time} కి {doctor} గారితో మీ అపాయింట్‌మెంట్ నిర్ధారించబడింది.",
    confirm_rescheduled: "{doctor} గారితో మీ అపాయింట్‌మెంట్ {time} కి మార్చబడింది.",
    confirm_cancelled: "{time} కి {doctor} గారితో మీ అపాయింట్‌మెంట్ రద్దు చేయబడింది.",
    menu_hint: "మరేదైనా చేయడానికి 'menu' అని పంపండి.",
    err_slot_taken: "క్షమించండి, ఆ సమయం ఇప్పుడే బుక్ అయ్యింది. మరో సమయం ఎంచుకుందాం.",
    err_time_unavailable: "ఆ సమయం ఇప్పుడు అందుబాటులో లేదు. మరో సమయం ఎంచుకుందాం.",
    err_generic: "క్షమించండి, అది కనుగొనలేకపోయాను. మళ్ళీ మొదలుపెడదాం.",
    confirm_join_prompt: "{doctor}: సుమారు {min}–{max} నిమి. వెయిట్, రావాల్సిన సమయం ~{arrival}. బుక్ చేయాలా? Yes/No నొక్కండి.",
    queue_joined: "{doctor} గారితో బుక్ అయింది. సుమారు {min}–{max} నిమి. వెయిట్ — {arrival} కల్లా రండి. 'status' అని పంపండి.",
    queue_status: "{doctor}: సుమారు {min}–{max} నిమి. వెయిట్, రావాల్సిన సమయం ~{arrival}.",
    queue_none: "ఈరోజు మీకు యాక్టివ్ టోకెన్‌లు లేవు.",
    queue_arrived: "{doctor} కోసం చెక్-ఇన్ ✓ — ఇప్పుడు సుమారు {min}–{max} నిమి.",
    queue_youre_next: "{doctor} కోసం మీరు తదుపరి! సిద్ధంగా ఉండండి.",
    queue_slip: "{doctor} కొంచెం ఆలస్యంగా ఉన్నారు — ఇప్పుడు సుమారు {min}–{max} నిమి.",
    ask_timing: "మీరు ఎప్పుడు రావాలనుకుంటున్నారు?",
    btn_come_now: "ఇప్పుడే వస్తాను",
    btn_pick_time: "సమయం ఎంచుకోండి",
    choose_time: "రావడానికి ఒక సమయం ఎంచుకోండి:",
    confirm_scheduled_prompt: "{doctor}: సుమారు {around} కి రండి, {comeBy} కల్లా చేరుకోండి. ఇది ఒక విండో, కచ్చితమైన నిమిషం కాదు. బుక్ చేయాలా? Yes/No నొక్కండి.",
    scheduled_busy_note: "గమనిక — ఆ సమయం రద్దీగా ఉంది, మిమ్మల్ని సుమారు ~{likely} కల్లా చూసే అవకాశం ఉంది.",
    queue_scheduled: "{doctor} గారితో సుమారు {around} కి బుక్ అయింది. {comeBy} కల్లా రండి — మీ సమయం దగ్గర లైవ్ క్యూలో చేరతారు. 'status' అని పంపండి.",
    queue_scheduled_due: "{doctor} గారితో మీ వంతు దగ్గరలో ఉంది — దయచేసి ఇప్పుడే క్లినిక్‌కు రండి.",
  },
  hi: {
    language_prompt: "Please choose your language / దయచేసి మీ భాషను ఎంచుకోండి / कृपया अपनी भाषा चुनें",
    btn_english: "English",
    btn_telugu: "తెలుగు",
    btn_hindi: "हिंदी",
    emergency_check: "क्या आप किसी चिकित्सा आपात स्थिति (emergency) में हैं?",
    btn_yes_emergency: "हाँ",
    btn_no: "नहीं",
    emergency_reply: "कृपया तुरंत 108 पर कॉल करें या नजदीकी आपातकालीन कक्ष (emergency room) में जाएँ।\n\nहमारे क्लिनिक रिसेप्शन के लिए कॉल करें: +919059790014",
    menu_prompt: "नमस्ते! मैं क्लिनिक बुकिंग असिस्टेंट हूँ। विकल्पों के लिए नीचे 'Main Menu' दबाएं — शुरू करने के लिए 'menu' भेजें।",
    menu_title: "मेनू",
    reprompt_menu: "कृपया मेनू से एक विकल्प चुनें, या फिर से शुरू करने के लिए 'menu' भेजें।",
    opt_book: "अपॉइंटमेंट बुक करें",
    opt_reschedule: "बदलें",
    opt_cancel: "रद्द करें",
    opt_view: "मेरे अपॉइंटमेंट",
    opt_doctors: "हमारे डॉक्टर",
    opt_about: "अस्पताल के बारे में",
    opt_receptionist: "रिसेप्शन",
    about_text: "हम ReceptionSync क्लिनिक हैं, बेहतरीन स्वास्थ्य सेवाएं प्रदान करते हैं। समय: सोम-शनि 9 AM से 7 PM। पता: 123 Health Ave.",
    receptionist_text: "हमारा रिसेप्शन काम के घंटों के दौरान उपलब्ध है। तत्काल सहायता के लिए कृपया हमें कॉल करें।",
    no_doctors: "अभी कोई डॉक्टर उपलब्ध नहीं हैं।",
    our_doctors_text: "हमारे डॉक्टर:",
    ask_name: "ज़रूर — अपॉइंटमेंट किसके नाम से बुक करना है?",
    no_appointments: "मुझे इस नंबर पर कोई अपॉइंटमेंट नहीं मिला।",
    upcoming_appointments: "आपके आगामी अपॉइंटमेंट:",
    choose_doctor: "आप किस डॉक्टर से मिलना चाहेंगे?",
    no_slots: "क्षमा करें, अगले 14 दिनों में कोई खाली समय नहीं है।",
    choose_slot: "अगले उपलब्ध समय यहाँ हैं:",
    confirm_book_prompt: "क्या {doctor} के साथ {time} पर बुक करें?",
    btn_yes_confirm: "हाँ",
    btn_no_back: "नहीं",
    choose_appt_reschedule: "आप कौन सा अपॉइंटमेंट बदलना चाहेंगे?",
    choose_appt_cancel: "आप कौन सा अपॉइंटमेंट रद्द करना चाहेंगे?",
    confirm_cancel_prompt: "क्या {doctor} के साथ {time} का अपॉइंटमेंट रद्द करें?",
    btn_yes_cancel: "हाँ रद्द करें",
    btn_no_keep: "नहीं रहने दें",
    reschedule_ok: "कोई बात नहीं। नया समय देखते हैं।",
    reply_1_or_2: "पुष्टि करने के लिए 1 और वापस जाने के लिए 2 का उत्तर दें।",
    booked_success: "{time} पर आपकी बुकिंग हो गई है। मिलते हैं!",
    rescheduled_success: "हो गया — आपका अपॉइंटमेंट अब {time} पर है।",
    cancelled_success: "आपका अपॉइंटमेंट रद्द कर दिया गया है।",
    remind_24h: "रिमाइंडर: कल {time} पर {doctor} के साथ आपका अपॉइंटमेंट है।",
    remind_2h: "रिमाइंडर: {doctor} के साथ आपका अपॉइंटमेंट 2 घंटे में ({time}) है।",
    confirm_booked: "{time} पर {doctor} के साथ आपका अपॉइंटमेंट पक्का हो गया है।",
    confirm_rescheduled: "{doctor} के साथ आपका अपॉइंटमेंट {time} पर बदल दिया गया है।",
    confirm_cancelled: "{time} पर {doctor} के साथ आपका अपॉइंटमेंट रद्द कर दिया गया है।",
    menu_hint: "कुछ और करने के लिए 'menu' भेजें।",
    err_slot_taken: "क्षमा करें, वह समय अभी-अभी बुक हो गया। चलिए दूसरा चुनें।",
    err_time_unavailable: "वह समय अब उपलब्ध नहीं है। चलिए दूसरा चुनें।",
    err_generic: "क्षमा करें, मुझे वह नहीं मिला। चलिए फिर से शुरू करें।",
    confirm_join_prompt: "{doctor}: लगभग {min}–{max} मिनट प्रतीक्षा, सुझाया आगमन ~{arrival}. बुक करें? Yes/No दबाएं.",
    queue_joined: "{doctor} के साथ बुक हुआ। लगभग {min}–{max} मिनट प्रतीक्षा — {arrival} तक पहुँचें। 'status' भेजें।",
    queue_status: "{doctor}: लगभग {min}–{max} मिनट प्रतीक्षा, सुझाया आगमन ~{arrival}।",
    queue_none: "आज आपके पास कोई सक्रिय टोकन नहीं है।",
    queue_arrived: "{doctor} के लिए चेक-इन ✓ — अब लगभग {min}–{max} मिनट।",
    queue_youre_next: "{doctor} के लिए आपकी बारी अगली है! तैयार रहें।",
    queue_slip: "{doctor} थोड़ा देरी से चल रहे हैं — अब लगभग {min}–{max} मिनट।",
    ask_timing: "आप कब आना चाहेंगे?",
    btn_come_now: "अभी आऊँगा",
    btn_pick_time: "समय चुनें",
    choose_time: "आने के लिए एक समय चुनें:",
    confirm_scheduled_prompt: "{doctor}: लगभग {around} पर आएँ, {comeBy} तक पहुँचें। यह एक विंडो है, सटीक मिनट नहीं। बुक करें? Yes/No दबाएं।",
    scheduled_busy_note: "ध्यान दें — वह समय व्यस्त है, आपको लगभग ~{likely} तक देखा जाएगा।",
    queue_scheduled: "{doctor} के साथ लगभग {around} के लिए बुक हुआ। {comeBy} तक पहुँचें — आप अपने समय के पास लाइव क्यू में शामिल होंगे। 'status' भेजें।",
    queue_scheduled_due: "{doctor} के साथ आपकी बारी पास है — कृपया अभी क्लिनिक आएँ।",
  }
};

export function t(key: TranslationKey, lang?: Language | null, params?: Record<string, string>): string {
  const language = lang ?? "en";
  let text = dict[language][key];
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, v);
    }
  }
  return text;
}
