/*
 * Сарати · стихи писаний
 * ------------------------------------------------------------------
 * Бхагавад-гита и Шримад-Бхагаватам. Санскрит дан в транслитерации IAST,
 * перевод — смысловой, сделан для этого сайта: это не перепечатка
 * какого-либо изданного перевода (на них есть права), а прямое
 * прочтение стиха. Перед публикацией сверьте нумерацию и текст с печатным
 * изданием — так делают с любой цитатой из писания.
 *
 * Поле themes связывает стих с небом дня: хозяин вары, хозяин накшатры
 * Луны, пакша и особые титхи. Выбор стиха «по времени» — в pickVerse().
 */
(function (root) {
  'use strict';

  var VERSES = [
    { src: 'Бхагавад-гита', ref: '2.13',
      sa: 'dehino ’smin yathā dehe kaumāraṁ yauvanaṁ jarā / tathā dehāntara-prāptir dhīras tatra na muhyati',
      ru: 'Как воплощённый проходит детство, юность и старость, так переходит он и в другое тело. Разумный этим не смущается.',
      themes: ['saturn', 'time', 'letting-go'] },
    { src: 'Бхагавад-гита', ref: '2.14',
      sa: 'mātrā-sparśās tu kaunteya śītoṣṇa-sukha-duḥkha-dāḥ / āgamāpāyino ’nityās tāṁs titikṣasva bhārata',
      ru: 'Прикосновения чувств дают холод и жар, радость и боль. Они приходят и уходят, они непостоянны — переноси их спокойно.',
      themes: ['saturn', 'moon', 'patience', 'krishna-paksha'] },
    { src: 'Бхагавад-гита', ref: '2.20',
      sa: 'na jāyate mriyate vā kadācin nāyaṁ bhūtvā bhavitā vā na bhūyaḥ / ajo nityaḥ śāśvato ’yaṁ purāṇo na hanyate hanyamāne śarīre',
      ru: 'Душа не рождается и не умирает. Она не возникала и не перестанет быть: нерождённая, вечная, древняя. Тело убивают — её не убить.',
      themes: ['ketu', 'time', 'letting-go', 'amavasya'] },
    { src: 'Бхагавад-гита', ref: '2.47',
      sa: 'karmaṇy evādhikāras te mā phaleṣu kadācana / mā karma-phala-hetur bhūr mā te saṅgo ’stv akarmaṇi',
      ru: 'Твоё право — в самом действии, а не в его плодах. Не действуй ради плода, но и не держись за бездействие.',
      themes: ['sun', 'mars', 'action', 'shukla-paksha'] },
    { src: 'Бхагавад-гита', ref: '2.48',
      sa: 'yoga-sthaḥ kuru karmāṇi saṅgaṁ tyaktvā dhanañjaya / siddhy-asiddhyoḥ samo bhūtvā samatvaṁ yoga ucyate',
      ru: 'Утвердившись в йоге, делай своё дело без привязанности, равно принимая успех и неудачу. Такая ровность и называется йогой.',
      themes: ['sun', 'saturn', 'action', 'equanimity'] },
    { src: 'Бхагавад-гита', ref: '2.62-63',
      sa: 'dhyāyato viṣayān puṁsaḥ saṅgas teṣūpajāyate ... krodhād bhavati sammohaḥ sammohāt smṛti-vibhramaḥ',
      ru: 'Кто мысленно возвращается к объектам желания, привязывается к ним; из привязанности растёт желание, из желания — гнев. Из гнева приходит помрачение, из помрачения — потеря памяти, а с ней теряется и разум.',
      themes: ['mars', 'rahu', 'mind', 'krishna-paksha'] },
    { src: 'Бхагавад-гита', ref: '2.70',
      sa: 'āpūryamāṇam acala-pratiṣṭhaṁ samudram āpaḥ praviśanti yadvat / tadvat kāmā yaṁ praviśanti sarve sa śāntim āpnoti na kāma-kāmī',
      ru: 'Как реки входят в океан, а он остаётся полным и неподвижным, так желания входят в того, кто обрёл покой. Покоя достигает не тот, кто гонится за желаниями.',
      themes: ['moon', 'venus', 'equanimity', 'purnima'] },
    { src: 'Бхагавад-гита', ref: '3.35',
      sa: 'śreyān sva-dharmo viguṇaḥ para-dharmāt sv-anuṣṭhitāt / sva-dharme nidhanaṁ śreyaḥ para-dharmo bhayāvahaḥ',
      ru: 'Лучше исполнять свой долг несовершенно, чем чужой — безупречно. Своё дело безопаснее даже на краю; чужое приносит страх.',
      themes: ['jupiter', 'sun', 'dharma', 'doubt'] },
    { src: 'Бхагавад-гита', ref: '4.7',
      sa: 'yadā yadā hi dharmasya glānir bhavati bhārata / abhyutthānam adharmasya tadātmānaṁ sṛjāmy aham',
      ru: 'Всякий раз, когда дхарма приходит в упадок и поднимается беззаконие, Я являю Себя.',
      themes: ['jupiter', 'dharma', 'shukla-paksha'] },
    { src: 'Бхагавад-гита', ref: '4.34',
      sa: 'tad viddhi praṇipātena paripraśnena sevayā / upadekṣyanti te jñānaṁ jñāninas tattva-darśinaḥ',
      ru: 'Узнай это через смирение, вопрошание и служение: знающие, видящие суть, откроют тебе знание.',
      themes: ['jupiter', 'mercury', 'learning', 'ekadashi'] },
    { src: 'Бхагавад-гита', ref: '5.29',
      sa: 'bhoktāraṁ yajña-tapasāṁ sarva-loka-maheśvaram / suhṛdaṁ sarva-bhūtānāṁ jñātvā māṁ śāntim ṛcchati',
      ru: 'Кто знает Меня как принимающего жертву и подвиг, как владыку всех миров и друга всех существ, — тот приходит к покою.',
      themes: ['venus', 'jupiter', 'friendship', 'purnima'] },
    { src: 'Бхагавад-гита', ref: '6.5',
      sa: 'uddhared ātmanātmānaṁ nātmānam avasādayet / ātmaiva hy ātmano bandhur ātmaiva ripur ātmanaḥ',
      ru: 'Поднимай себя сам и сам себя не унижай. Ведь человек сам себе и друг, и враг.',
      themes: ['mars', 'sun', 'doubt', 'discipline'] },
    { src: 'Бхагавад-гита', ref: '6.17',
      sa: 'yuktāhāra-viharasya yukta-ceṣṭasya karmasu / yukta-svapnāvabodhasya yogo bhavati duḥkha-hā',
      ru: 'У того, кто размерен в еде и отдыхе, в делах и в том, когда спит и когда встаёт, йога снимает страдание.',
      themes: ['moon', 'saturn', 'discipline', 'rest'] },
    { src: 'Бхагавад-гита', ref: '6.35',
      sa: 'asaṁśayaṁ mahā-bāho mano durnigrahaṁ calam / abhyāsena tu kaunteya vairāgyeṇa ca gṛhyate',
      ru: 'Да, ум подвижен и его трудно удержать. Но он берётся — постоянным упражнением и непривязанностью.',
      themes: ['moon', 'mercury', 'mind', 'discipline'] },
    { src: 'Бхагавад-гита', ref: '9.22',
      sa: 'ananyāś cintayanto māṁ ye janāḥ paryupāsate / teṣāṁ nityābhiyuktānāṁ yoga-kṣemaṁ vahāmy aham',
      ru: 'О тех, кто без иной мысли поклоняется Мне и всегда связан со Мной, Я Сам забочусь — и о пути, и о нужде.',
      themes: ['jupiter', 'venus', 'surrender', 'ekadashi'] },
    { src: 'Бхагавад-гита', ref: '9.27',
      sa: 'yat karoṣi yad aśnāsi yaj juhoṣi dadāsi yat / yat tapasyasi kaunteya tat kuruṣva mad-arpaṇam',
      ru: 'Что бы ты ни делал, ни ел, ни приносил в жертву, ни давал, ни совершал как подвиг — делай это как поднесённое Мне.',
      themes: ['sun', 'venus', 'action', 'surrender'] },
    { src: 'Бхагавад-гита', ref: '12.13-14',
      sa: 'adveṣṭā sarva-bhūtānāṁ maitraḥ karuṇa eva ca / nirmamo nirahaṅkāraḥ sama-duḥkha-sukhaḥ kṣamī',
      ru: 'Кто не держит вражды ни к кому, дружелюбен и участлив, свободен от «моего» и от самомнения, ровен в горе и радости, терпелив — тот Мне дорог.',
      themes: ['venus', 'moon', 'friendship', 'equanimity'] },
    { src: 'Бхагавад-гита', ref: '17.15',
      sa: 'anudvega-karaṁ vākyaṁ satyaṁ priya-hitaṁ ca yat / svādhyāyābhyasanaṁ caiva vāṅ-mayaṁ tapa ucyate',
      ru: 'Речь, которая не ранит, правдива, добра и полезна, а также постоянное изучение писаний — это подвиг речи.',
      themes: ['mercury', 'speech', 'learning'] },
    { src: 'Бхагавад-гита', ref: '18.66',
      sa: 'sarva-dharmān parityajya mām ekaṁ śaraṇaṁ vraja / ahaṁ tvāṁ sarva-pāpebhyo mokṣayiṣyāmi mā śucaḥ',
      ru: 'Оставь все опоры и приди под защиту Меня одного. Я освобожу тебя от всего дурного — не печалься.',
      themes: ['ketu', 'surrender', 'fear', 'amavasya'] },
    { src: 'Шримад-Бхагаватам', ref: '1.2.6',
      sa: 'sa vai puṁsāṁ paro dharmo yato bhaktir adhokṣaje / ahaituky apratihatā yayātmā suprasīdati',
      ru: 'Высшее занятие для человека — то, из которого рождается преданность Всевышнему: беспричинная и ничем не прерываемая. От неё душа приходит в полное удовлетворение.',
      themes: ['jupiter', 'dharma', 'surrender', 'ekadashi'] },
    { src: 'Шримад-Бхагаватам', ref: '1.2.11',
      sa: 'vadanti tat tattva-vidas tattvaṁ yaj jñānam advayam / brahmeti paramātmeti bhagavān iti śabdyate',
      ru: 'Знающие суть говорят: истина одна, знание её нераздельно, и называют её Брахманом, Параматмой и Бхагаваном.',
      themes: ['mercury', 'jupiter', 'learning'] },
    { src: 'Шримад-Бхагаватам', ref: '3.25.25',
      sa: 'satāṁ prasaṅgān mama vīrya-saṁvido bhavanti hṛt-karṇa-rasāyanāḥ kathāḥ',
      ru: 'В обществе праведных беседы о Моих делах становятся лекарством для сердца и слуха.',
      themes: ['venus', 'friendship', 'speech', 'purnima'] },
    { src: 'Шримад-Бхагаватам', ref: '7.5.23',
      sa: 'śravaṇaṁ kīrtanaṁ viṣṇoḥ smaraṇaṁ pāda-sevanam / arcanaṁ vandanaṁ dāsyaṁ sakhyam ātma-nivedanam',
      ru: 'Слушать, воспевать, помнить, служить стопам, поклоняться, молиться, служить как слуга, дружить и отдать себя — девять путей преданности.',
      themes: ['moon', 'venus', 'discipline', 'surrender'] },
    { src: 'Шримад-Бхагаватам', ref: '10.14.8',
      sa: 'tat te ’nukampāṁ su-samīkṣamāṇo bhuñjāna evātma-kṛtaṁ vipākam',
      ru: 'Кто принимает последствия своих же поступков, видя в них Твою милость, — тот идёт к освобождению.',
      themes: ['saturn', 'rahu', 'patience', 'letting-go', 'krishna-paksha'] }
  ];

  /** Детерминированный хеш строки — чтобы один и тот же день давал один стих. */
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h;
  }

  /**
   * Выбор стиха по небу дня.
   * @param {Object} sky {varaLord, nakshatraLord, paksha, tithiName, dateKey}
   * @returns {Object} стих + reasons: почему выбран именно он
   */
  function pickVerse(sky) {
    var wanted = [];
    if (sky.varaLord) wanted.push({ tag: sky.varaLord, weight: 3, why: 'хозяин дня' });
    if (sky.nakshatraLord) wanted.push({ tag: sky.nakshatraLord, weight: 3, why: 'хозяин накшатры Луны' });
    wanted.push({ tag: sky.paksha === 'шукла' ? 'shukla-paksha' : 'krishna-paksha',
                  weight: 2, why: sky.paksha === 'шукла' ? 'растущая Луна' : 'убывающая Луна' });
    if (sky.tithiName === 'Экадаши') wanted.push({ tag: 'ekadashi', weight: 4, why: 'экадаши' });
    if (sky.tithiName === 'Пурнима') wanted.push({ tag: 'purnima', weight: 4, why: 'полнолуние' });
    if (sky.tithiName === 'Амавасья') wanted.push({ tag: 'amavasya', weight: 4, why: 'новолуние' });

    var scored = VERSES.map(function (v) {
      var score = 0, reasons = [];
      wanted.forEach(function (w) {
        if (v.themes.indexOf(w.tag) >= 0) { score += w.weight; reasons.push(w.why); }
      });
      return { verse: v, reasons: reasons, score: score };
    });

    var max = scored.reduce(function (m, s) { return Math.max(m, s.score); }, 0);
    // Берём не единственного лидера, а всех, кто отстал не более чем на один
    // вес: небо дня задаёт круг подходящих стихов, дата выбирает внутри него.
    // Так стих остаётся связанным с небом, но месяц не повторяет три текста.
    var pool = scored.filter(function (s) { return s.score >= Math.max(1, max - 1); });
    if (!pool.length) pool = scored;
    var pick = pool[hash(sky.dateKey || '') % pool.length];
    return { verse: pick.verse, reasons: pick.reasons, score: pick.score, poolSize: pool.length };
  }

  root.SarathiVerses = { VERSES: VERSES, pickVerse: pickVerse, hash: hash };
})(typeof globalThis !== 'undefined' ? globalThis : this);
