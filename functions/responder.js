const fetch = require('node-fetch');

// This function simulates fetching the unique business context for a Ukrainian client.
function getBusinessContext() {
    return {
        businessName: "Медичний центр Medical Plaza",
        responderName: "Олена, контакт-центр Medical Plaza ",
        styleGuideExamples: [
            "Дякуємо вам за довіру та такий теплий відгук! Раді, що консультація у лікаря-отоларинголога Віктора Петровича Товстолита була для вас корисною та допомогла розібратись у ситуації. Бажаємо вам міцного здоров’я!",
            "Добрий день, пані Лідіє! Щиро дякуємо за Ваш відгук та високу оцінку стаціонара на Оболонській набережній. Нам дуже приємно знати, що Ви залишилися задоволені візитом.Бажаємо Вам міцного здоров’я та гарного настрою! Завжди раді бачити Вас у Медичному центрі Medical Plaza.",
            "Владиславе, дякуємо вам за довіру і зворотній зв'язок! Костянтин Едуардович - наш провідний фахівець в оперативній урології. Пишаємось своєю командою і радіємо, коли можемо допомогти нашим пацієнтам!"
        ],
        // REINSTATED: The crucial list of words and phrases to avoid.
        avoidWords: ["неймовірно", "дивовижно", "ми в захваті", "дякуємо, що знайшли час", "високі стандарти", "велика мотивація", "найвищий рівень"],
        serviceRecoveryOffer: "Ваше звернення буде передано Заступнику медичного директора з питань якості."
    };
}

// This function builds the final, definitive Ukrainian prompt
function buildSystemPrompt(context, review, authorName) {
    const formattedExamples = context.styleGuideExamples.map(ex => `- "${ex}"`).join('\n');
    const formattedAvoidWords = context.avoidWords.join(', ');

    return `You are a sophisticated AI assistant helping "${context.responderName}" from "${context.businessName}" draft a professional, empathetic, and brand-aligned reply to a customer review in Ukrainian.

    **Your Task:**
    You MUST respond with a valid JSON object containing your full analysis and the final draft.

    **JSON Output Structure:**
    {
      "analysis": {
        "name_analysis": "Explain your decision for the greeting.",
        "sentiment": "Positive, Negative, or Mixed",
        "all_points": ["A list of all key points from the review, in Ukrainian."],
        "main_point_selection": "Explain in Ukrainian which point you chose as the main theme and WHY."
      },
      "draft": "The final, human-sounding reply text, in Ukrainian."
    }

    **Your Thought Process & Rules (Follow in this exact order):**

    **Part 1: The "analysis" object**
    1.  **name_analysis:** This is your first and most important step. Analyze the author's name: "${authorName}".
        -   **IF** it is a real human name, **including common short forms** (e.g., "Олена", "Володимир Петренко", "Віка"), state that you are using it and that you will use **only the first name** in the vocative case.
        -   **IN ALL OTHER CASES** (if it is a nickname, contains numbers, or is blank), state that it is not a real name and you will use a generic, polite, and **varied** greeting. **Do not use the same generic greeting twice.**
    2.  **sentiment (CRITICAL SECOND STEP):** Read the entire review. After analyzing the name, you MUST classify the sentiment. To do this, check if the review contains BOTH positive and negative comments.
        -   IF it contains both, the sentiment MUST be "Mixed".
        -   Otherwise, classify it as "Positive" or "Negative".
    3.  **all_points:** Now, list every distinct positive and negative point made by the customer.
    4.  **main_point_selection:** This is the most critical step. From your list of points, you MUST select the SINGLE best point to be the theme of the reply, using this strict priority order:
        -   **Priority 1 (Highest):** Specific, emotional comments about how the service made the patient or their family (especially children) feel.
        -   **Priority 2:** Praise or criticism for a specific person (e.g., a named doctor like "Лікар Зіброва"or "the nurse").
        -   **Priority 3:** Comments about a specific, tangible part of the service (quality of tests, diagnosis).
        -   **Priority 4 (Lowest):** General comments about the facility (clean, fast).
        
    **Part 2: The "draft" object (Your Response Strategy)**
    *   **Greeting:** Begin your draft with the greeting you decided on in your "name_analysis".
    *   **For Mixed Reviews (Follow this 3-step checklist EXACTLY):**
        1.  **APOLOGIZE:** Start with a sincere apology for the specific negative point.
        2.  **RECOVER:** Immediately offer the solution: "${context.serviceRecoveryOffer}" and provide a way to take the conversation offline.
        3.  **APPRECIATE:** As the final part of your message, you MUST thank them for their positive feedback.
    *   **For Positive Reviews:** Thank the customer and build the reply ONLY around the single "main_point" you selected.
    *   **For Negative Reviews:** Start with an apology, mention the negative "main_point", and state the recovery offer.
    
    **General Rules for the Draft:**
    -   **Style:** The tone must be friendly and match the provided examples. You MUST avoid the words from the "avoid words" list.
    -   **Sign-off:** You MUST sign off with: "- ${context.responderName}".

    **Context for the Task:**
    *   **Style Guide Examples:** ${formattedExamples}
    *   **Words to Avoid:** ${formattedAvoidWords}
    *   **Service Recovery Offer:** ${context.serviceRecoveryOffer}
    *   **Customer's Review to Analyze:** "${review}"

    Now, generate the complete JSON object.`;
}

exports.handler = async function (event) {
    
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  
  const { reviewText, authorName } = JSON.parse(event.body);
  const businessContext = getBusinessContext();
  const systemPrompt = buildSystemPrompt(businessContext, reviewText, authorName);
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, },
      body: JSON.stringify({
        model: 'gpt-4-turbo',
        messages: [ { role: 'user', content: systemPrompt } ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) { 
        const errorData = await response.json(); 
        console.error("OpenAI API Error:", errorData);
        throw new Error('OpenAI API request failed.');
    }
    const data = await response.json();
    
    const aiJsonResponse = JSON.parse(data.choices[0].message.content);
    
    console.log("AI Full Analysis:", JSON.stringify(aiJsonResponse.analysis, null, 2));
    
    const aiReply = aiJsonResponse.draft;

    return { statusCode: 200, body: JSON.stringify({ draftReply: aiReply }), };
  } catch (error) {
    console.error("Error in function execution:", error);
    return { 
        statusCode: 500, 
        body: JSON.stringify({ error: "AI service is currently unavailable.", details: error.message }) 
    };
  }
};
















