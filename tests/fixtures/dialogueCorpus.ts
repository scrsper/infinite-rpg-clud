import type { ConversationalIntent } from '../../src/sim/mind/conversationalIntent';
import type { Reference, ConversationContext } from '../../src/language/parser';
export const REFERENCES: Reference[] = [
  ...['Edwin', 'Mara', 'Tomas', 'Garrick'].map(name => ({ id: `p_${name.toLowerCase()}`, name, kind: 'person' as const, aliases: name === 'Edwin' ? ['blacksmith', 'smith'] : [] })),
  { id: 'mill', kind: 'place', name: 'mill' }, { id: 'bakery', kind: 'place', name: 'bakery' },
  { id: 'bread', kind: 'item', name: 'bread' }, { id: 'flour', kind: 'item', name: 'flour' },
];
export interface CorpusCase { text: string; intent: ConversationalIntent['intent']; context?: ConversationContext; personId?: string; itemType?: string }
const groups: [ConversationalIntent['intent'], string[]][] = [
  ['greet', ['hello', 'hi', 'hey there', 'greetings', 'good morning']],
  ['goodbye', ['bye', 'goodbye', 'farewell', 'see you later']],
  ['ask_about_person_location', ['where is Edwin', "where's Edwin", 'have you seen Edwin', 'do you know where i can find Edwin', 'Edwin around', 'which way did Edwin go', 'where can i find the smith', 'have you seen the blacksmith']],
  ['ask_about_person', ['do you know Mara', 'tell me about Garrick', 'who are you', 'what is your name']],
  ['ask_about_relationship', ['what do you think about Garrick', 'what do you think of Mara']],
  ['ask_for_directions', ['how do i get to the mill', 'which way is the bakery', 'where is the mill', 'give me directions to the bakery']],
  ['ask_about_place', ['tell me about the mill', 'what is this place']],
  ['ask_about_event', ['what happened here', 'what happened to Tomas', 'what is the news', 'anything new', 'did you see a theft']],
  ['ask_about_rumor', ['did you hear about the theft', 'have you heard about the old road', 'any rumor', 'tell me a rumour']],
  ['ask_about_work', ['any work going', 'looking for work', 'do you have any work']],
  ['ask_about_occupation', ['what do you do', 'what is your job', 'tell me your occupation']],
  ['ask_about_availability', ['do you have any bread', 'do you sell bread', 'is flour for sale']],
  ['ask_price', ['how much for the flour', 'what is the price of bread', 'how much is that bread', 'what does flour cost']],
  ['request_purchase', ['can i buy bread', 'i want to purchase flour', 'i will take one bread', 'i want to buy two bread']],
  ['offer_sale', ['can i sell you bread', 'i want to sell flour']],
  ['ask_about_trade', ['can we trade', 'that is too expensive']],
  ['ask_about_ownership', ['who owns this house', 'whose bread is this', 'who does the flour belong to']],
  ['ask_about_item', ['what is that item']],
  ['ask_about_food', ['where can i get food', 'i am hungry', 'something to eat']],
  ['ask_about_resources', ['any resources', 'where are the supplies', 'do we need materials']],
  ['ask_for_help', ['can you help me', 'please help me']],
  ['offer_help', ['can i help you', 'let me help', 'i can help']],
  ['ask_about_health', ['how are you', 'are you well', 'how are you feeling']],
  ['ask_about_injury', ['are you hurt', 'are you injured', 'how is your wound']],
  ['ask_about_weather', ['what is the weather', 'will it rain', 'what about the wind']],
  ['ask_about_relationship_to_player', ['what do you think of me', 'do you like me', 'do you trust me']],
  ['ask_about_emotion', ['why are you angry', 'what is troubling you', 'what is wrong']],
  ['thank', ['thank you', 'thanks']], ['apologize', ['sorry', 'i apologize', 'i apologise']],
  ['compliment', ['you are kind', 'you are helpful']], ['insult', ['you are an idiot', 'you fool']],
  ['threaten', ['i will hurt you', 'you will regret this']], ['agree', ['i agree', 'sounds good']],
  ['disagree', ['i disagree', 'i do not agree']], ['yes', ['yes', 'yeah', 'sure']], ['no', ['no', 'nope']],
  ['unknown', ['where is he', 'i want some food', 'when', 'are you sure', 'who told you that', 'can i buy that', 'zxqv', '???', 'read secret files', 'where is Edwin and Mara', 'buy bread and flour']],
];
export const DIALOGUE_CORPUS: CorpusCase[] = groups.flatMap(([intent, texts]) => texts.flatMap(text => [text, `  ${text.toUpperCase()}?!  `, `please ${text}, please`].map(text => ({ text, intent }))));
for (const name of ['Mara', 'Tomas', 'Garrick']) for (const text of [`where is ${name}`, `have you seen ${name}`, `do you know where ${name} is`, `${name} around`]) DIALOGUE_CORPUS.push({ text, intent: 'ask_about_person_location', personId: `p_${name.toLowerCase()}` });
for (const [text, intent] of [['when', 'ask_when'], ['who told you that', 'ask_provenance'], ['who saw it', 'ask_provenance'], ['are you sure', 'ask_certainty'], ['how much for two', 'ask_price'], ["I'll take one", 'request_purchase']] as const) DIALOGUE_CORPUS.push({ text, intent, context: { personId: 'p_edwin', knowledgeId: 'ev:theft', itemId: 'bread', itemType: 'bread', subject: 'theft' } });
