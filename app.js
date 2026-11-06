const demoBooks = [
  { title: "아주 작은 습관의 힘", author: "제임스 클리어", category: "자기계발 · 습관", year: "2023", loans: 0, color: 1 },
  { title: "불안 세대", author: "조너선 하이트", category: "사회 · 심리", year: "2024", loans: 0, color: 2 },
  { title: "세상은 실제로 어떻게 돌아가는가", author: "바츨라프 스밀", category: "과학 · 데이터", year: "2023", loans: 0, color: 3 },
  { title: "일의 감각", author: "조수용", category: "진로 · 에세이", year: "2024", loans: 0, color: 4 },
  { title: "마음챙김의 시", author: "류시화", category: "시 · 마음챙김", year: "2022", loans: 0, color: 5 },
  { title: "어서 오세요, 휴남동 서점입니다", author: "황보름", category: "소설 · 문학", year: "2023", loans: 0, color: 6 },
];

const grid = document.querySelector("#book-grid");
const bookDetailContent = document.querySelector("#book-detail-content");
const searchForm = document.querySelector("#search-form");
const interestInput = document.querySelector("#interest-input");
const resultCount = document.querySelector("#result-count");
const resultCaption = document.querySelector("#result-caption");
const resultCountLabel = document.querySelector("#result-count-label");
const difficultyFilterSelect = document.querySelector("#difficulty-filter");
const emptyState = document.querySelector("#empty-state");
const best3Section = document.querySelector("#best3-section");
const best3Grid = document.querySelector("#best3-grid");
const otherBooksHeading = document.querySelector("#other-books-heading");
const otherBooksCount = document.querySelector("#other-books-count");
const showMoreButton = document.querySelector("#show-more-button");
const analysisReport = document.querySelector("#analysis-report");
const balancedBundle = document.querySelector("#balanced-bundle");
const projectSearchForm = document.querySelector("#project-search-form");
const projectSubjectInput = document.querySelector("#project-subject-input");
const projectTopicInput = document.querySelector("#project-topic-input");
const projectDirectionInput = document.querySelector("#project-direction-input");
const rubricFileInput = document.querySelector("#rubric-file");
const rubricFileName = document.querySelector("#rubric-file-name");
const rubricPreview = document.querySelector("#rubric-preview");
const rubricError = document.querySelector("#rubric-error");
const rubricProgress = document.querySelector("#rubric-progress");
const readingInsights = document.querySelector("#reading-insights");
const historySearchCount = document.querySelector("#history-search-count");
const historyRecoCaption = document.querySelector("#history-reco-caption");
const historyKeywords = document.querySelector("#history-keywords");
const historyRecommendations = document.querySelector("#history-recommendations");
const historyEmpty = document.querySelector("#history-empty");
const clearSearchHistoryButton = document.querySelector("#clear-search-history");
const fileInput = document.querySelector("#csv-file");
const dropZone = document.querySelector("#drop-zone");
const uploadTitle = document.querySelector("#upload-title");
const uploadDescription = document.querySelector("#upload-description");
const datasetMeta = document.querySelector("#dataset-meta");
const uploadError = document.querySelector("#upload-error");
const columnMapping = document.querySelector("#column-mapping");
const titleColumn = document.querySelector("#title-column");

let books = demoBooks.map((book) => ({ ...book, raw: "" }));
let isDemo = true;
let pendingCSV = null;
let visibleBookCount = 12;
let activeQuery = "";
let activeSearchMode = "interest";
let difficultyFilter = "all";
let activeProjectContext = null;
let activeRubric = [];
let activeRubricFilename = "";
let tesseractScriptPromise = null;
const ratingStorageKey = "bookpath-reading-ratings-v1";
const searchHistoryStorageKey = "bookpath-search-history-v1";
const taskUsefulnessStorageKey = "bookpath-task-usefulness-v1";
const viewedBooksStorageKey = "bookpath-viewed-books-v1";
let readingRatings = {};
let searchHistory = [];
let taskUsefulness = {};
let viewedBookHistory = [];
let currentRankedBooks = [];
let selectedBookKey = "";
let currentInquiryQuestions = [];
let selectedInquiryIndex = -1;

try { readingRatings = JSON.parse(localStorage.getItem(ratingStorageKey) || "{}"); } catch { readingRatings = {}; }
try { taskUsefulness = JSON.parse(localStorage.getItem(taskUsefulnessStorageKey) || "{}"); } catch { taskUsefulness = {}; }
try {
  const storedHistory = JSON.parse(localStorage.getItem(searchHistoryStorageKey) || "[]");
  searchHistory = Array.isArray(storedHistory) ? storedHistory.filter((entry) => typeof entry?.query === "string").slice(0, 30) : [];
} catch { searchHistory = []; }
try {
  const storedViews = JSON.parse(localStorage.getItem(viewedBooksStorageKey) || "[]");
  viewedBookHistory = Array.isArray(storedViews) ? storedViews.filter((entry) => typeof entry?.category === "string").slice(0, 100) : [];
} catch { viewedBookHistory = []; }

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function titleKey(title) {
  return title.toLowerCase().replace(/[\s:："'’.,()（）\-_]/g, "");
}

function categoryKey(book) {
  return (book.category || "").split(/[·/|]/, 1)[0].trim().toLowerCase();
}

function categoryDisplayLabel(book) {
  return (book.category || "기타").replace(/\s*[·|]\s*KDC.*$/i, "").trim() || "기타";
}

function recordBookView(book) {
  viewedBookHistory.unshift({ title: book.title, category: categoryDisplayLabel(book), viewedAt: Date.now() });
  viewedBookHistory = viewedBookHistory.slice(0, 100);
  try { localStorage.setItem(viewedBooksStorageKey, JSON.stringify(viewedBookHistory)); } catch { /* Keep view history for this page session. */ }
}

function showView(name) {
  document.querySelectorAll(".app-view").forEach((view) => { view.hidden = view.dataset.view !== name; });
  document.querySelectorAll(".nav-link").forEach((tab) => {
    const selected = tab.dataset.viewTarget === name || (name === "book-detail" && tab.dataset.viewTarget === "discover");
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });
  window.scrollTo(0, 0);
  if (name === "project") projectSubjectInput.focus();
}

document.querySelectorAll("[data-view-target]").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.viewTarget));
});

function parseCSV(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = [",", "\t", ";"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(cell); cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = []; cell = "";
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell); if (row.some((value) => value.trim())) rows.push(row); }
  return rows;
}

function findColumn(headers, patterns) {
  const normalize = (value) => value.toLowerCase().replace(/[\s_()[\]{}\-./:：]/g, "");
  const normalizedPatterns = patterns.map(normalize);
  return headers.map(normalize).findIndex((header) => normalizedPatterns.some((pattern) => header.includes(pattern)));
}

function textValue(row, index) { return index < 0 ? "" : String(row[index] ?? "").trim(); }

function rubricValue(cell) {
  return cell && typeof cell === "object" ? cell.value ?? "" : cell ?? "";
}

function parseRubricCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const criterionIndex = findColumn(headers, ["평가항목", "평가기준", "기준", "criterion", "항목"]);
  const pointsIndex = findColumn(headers, ["배점", "점수", "points", "score"]);
  if (criterionIndex < 0 || pointsIndex < 0) return [];
  return rows.slice(1).map((row) => ({ label: textValue(row, criterionIndex), points: textValue(row, pointsIndex) }));
}

function parseRubricJSON(data) {
  const rows = Array.isArray(data) ? data : Array.isArray(data.criteria) ? data.criteria : Array.isArray(data.rows) ? data.rows : null;
  if (rows) return rows.map((row) => ({
    label: row.label ?? row.criterion ?? row.name ?? row["평가 항목"] ?? row["평가 기준"] ?? "",
    points: row.points ?? row.score ?? row.weight ?? row["배점"] ?? row["점수"] ?? "",
  }));

  const columns = Array.isArray(data.columns) ? data.columns : [];
  const cells = data.cells && typeof data.cells === "object" ? Object.values(data.cells) : [];
  const criterionColumn = columns.find((column) => /평가\s*항목|평가\s*기준|criterion/i.test(column.name || "")) || columns.find((column) => column.type === "title");
  const pointsColumn = columns.find((column) => /배점|점수|points?|score/i.test(column.name || ""));
  if (!criterionColumn || !pointsColumn) return [];
  return cells.map((row) => ({ label: rubricValue(row[criterionColumn.id]), points: rubricValue(row[pointsColumn.id]) }));
}

function parseRubricText(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const entries = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/^[•·\-*\d.)\s]+/, "");
    const match = line.match(/^(.+?)(?:\s{2,}|[,;|\t]\s*|\s+)(\d+(?:\.\d+)?)\s*점?\s*$/);
    if (match) {
      entries.push({ label: match[1].trim(), points: match[2] });
      continue;
    }
    const nextLinePoints = lines[index + 1]?.match(/^\s*(\d+(?:\.\d+)?)\s*점\s*$/);
    if (line && nextLinePoints) {
      entries.push({ label: line, points: nextLinePoints[1] });
      index += 1;
    }
  }
  if (entries.length) return entries;
  const unweightedCriteria = lines.map((line) => {
    const match = line.match(/^(?:[가나다라마바사아자차카타파하]|\d+)\s*[.)]\s*(.+)$/u);
    if (!match) return null;
    const label = match[1].replace(/(?<=[가-힣])\s+(?=[가-힣])/gu, "").replace(/\s+/g, " ").trim();
    if (/^(일자|내용|유의사항|안내|독후활동양식)/.test(label)) return null;
    return label ? { label, points: 1, unweighted: true } : null;
  }).filter(Boolean);
  return unweightedCriteria;
}

function loadTesseractScript() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!tesseractScriptPromise) {
    tesseractScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
      script.crossOrigin = "anonymous";
      script.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error("OCR 엔진을 시작하지 못했어요."));
      script.onerror = () => {
        tesseractScriptPromise = null;
        reject(new Error("OCR 엔진을 불러오지 못했어요. 인터넷 연결을 확인하거나 CSV·JSON 파일을 사용해 주세요."));
      };
      document.head.append(script);
    });
  }
  return tesseractScriptPromise;
}

async function recognizeRubricImage(file) {
  const tesseract = await loadTesseractScript();
  const worker = await tesseract.createWorker("kor+eng", 1, {
    workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
    langPath: "https://tessdata.projectnaptha.com/4.0.0",
    logger: ({ status, progress }) => {
      const labels = { "loading tesseract core": "OCR 엔진 준비 중", "loading language traineddata": "한글 인식 자료 불러오는 중", "initializing tesseract": "OCR 초기화 중", "recognizing text": "사진 속 글자 읽는 중" };
      const percent = Number.isFinite(progress) ? ` ${Math.round(progress * 100)}%` : "";
      rubricProgress.textContent = `${labels[status] || "OCR 준비 중"}${percent}`;
      rubricProgress.hidden = false;
    },
  });
  try {
    await worker.setParameters({ preserve_interword_spaces: "1" });
    const result = await worker.recognize(file);
    return result.data.text || "";
  } finally {
    await worker.terminate();
  }
}

function renderRubricPreview() {
  const total = activeRubric.reduce((sum, criterion) => sum + criterion.points, 0);
  const hasExplicitPoints = activeRubric.some((criterion) => !criterion.unweighted);
  rubricFileName.textContent = `${activeRubricFilename} · ${activeRubric.length}개 기준 · ${hasExplicitPoints ? `총 ${total}점` : "배점 미표기 · 동일 비중"}`;
  rubricPreview.innerHTML = `<div class="rubric-preview-heading"><strong>읽어 온 기준을 확인·수정하세요</strong><button type="button" id="clear-rubric">기준표 해제</button></div><div class="rubric-criteria-list">${activeRubric.map((criterion, index) => `<div class="rubric-edit-row"><input type="text" data-rubric-label="${index}" aria-label="평가 항목 ${index + 1}" value="${escapeHTML(criterion.label)}"><input type="number" min="0" step="1" data-rubric-points="${index}" aria-label="${escapeHTML(criterion.label)} 배점" placeholder="동일" value="${criterion.unweighted ? "" : criterion.points}"><span>${criterion.unweighted ? "비중" : "점"}</span></div>`).join("")}</div><button type="button" class="rubric-apply-button" id="apply-rubric-edits">수정한 기준 반영</button>`;
  rubricPreview.hidden = false;
}

async function loadRubricFile(file) {
  if (!file) return;
  rubricError.hidden = true;
  rubricProgress.hidden = true;
  activeRubricFilename = file.name;
  rubricFileName.textContent = file.name;
  try {
    if (file.size > 15 * 1024 * 1024) throw new Error("파일은 15MB 이하로 올려주세요.");
    const extension = file.name.split(".").pop().toLowerCase();
    let entries;
    if (file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name)) {
      rubricProgress.textContent = "OCR 엔진을 준비하고 있어요. 처음 사용하면 한글 인식 자료를 내려받아요.";
      rubricProgress.hidden = false;
      entries = parseRubricText(await recognizeRubricImage(file));
    } else {
      const text = decodeCSVBytes(new Uint8Array(await file.arrayBuffer()));
      if (extension === "json") entries = parseRubricJSON(JSON.parse(text));
      else if (extension === "csv") entries = parseRubricCSV(text);
      else entries = parseRubricText(text);
    }
    const parsed = entries.map((entry) => {
      const label = String(entry.label || "").trim();
      const pointText = String(entry.points ?? "").trim();
      const parsedPoints = Number(pointText.match(/\d+(?:\.\d+)?/)?.[0]) || 0;
      const unweighted = Boolean(entry.unweighted);
      return { label, points: parsedPoints || (unweighted ? 1 : 0), unweighted };
    }).filter((entry) => entry.label && entry.points > 0);
    if (!parsed.length) throw new Error("평가 항목과 배점을 읽지 못했어요. 사진은 글자와 점수가 선명하게 보이도록 촬영해 주세요.");
    const total = parsed.reduce((sum, entry) => sum + entry.points, 0);
    activeRubric = parsed.map((entry) => ({ ...entry, weight: entry.points / total }));
    activeRubricFilename = file.name;
    renderRubricPreview();
  } catch (error) {
    activeRubric = [];
    rubricPreview.innerHTML = "";
    rubricPreview.hidden = true;
    rubricFileName.textContent = activeRubricFilename || file.name;
    rubricError.textContent = error.message || "평가 기준을 읽지 못했어요. Affine JSON 또는 평가 항목·배점이 포함된 CSV를 사용해 주세요.";
    rubricError.hidden = false;
  } finally {
    rubricProgress.hidden = true;
  }
}

function isStudentAppropriate(book) {
  const childAudience = /유아|영유아|초등|아동|어린이|유치원|키즈/i;
  const childTitle = /흔한남매|에그박사|고양이 해결사 깜냥|똥볶이 할멈|슈뻘맨|빨간내복야코|마법천자문|과학\s*탐험대|초등|그림책|그림\s*동화|동화책|어린이|유아|유치원|키즈|kids|children|picture\s*book/i;
  if (childAudience.test(book.target || "")) return false;
  if (/^7/.test(String(book.isbnSupplement || "").trim())) return false;
  return !childTitle.test(`${book.title} ${book.category}`);
}

function decodeCSVBytes(bytes) {
  const hasUtf16LEBOM = bytes[0] === 0xff && bytes[1] === 0xfe;
  const hasUtf16BEBOM = bytes[0] === 0xfe && bytes[1] === 0xff;
  let text;
  if (hasUtf16LEBOM) text = new TextDecoder("utf-16le").decode(bytes);
  else if (hasUtf16BEBOM) text = new TextDecoder("utf-16be").decode(bytes);
  else text = new TextDecoder("utf-8").decode(bytes);
  if (!hasUtf16LEBOM && !hasUtf16BEBOM && text.includes("\uFFFD")) {
    try { text = new TextDecoder("euc-kr").decode(bytes); } catch { /* Keep the browser-decoded text. */ }
  }
  return text.replace(/^\uFEFF/, "");
}

function readCSV(file) {
  uploadError.hidden = true;
  columnMapping.hidden = true;
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    showUploadError("파일이 20MB를 넘어요. 더 작은 CSV 파일을 선택해 주세요.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const bytes = new Uint8Array(reader.result);
    loadCSVText(decodeCSVBytes(bytes), file.name);
  };
  reader.onerror = () => showUploadError("파일을 읽지 못했어요. CSV 파일인지 확인해 주세요.");
  reader.readAsArrayBuffer(file);
}

function loadCSVText(text, filename, append = false) {
  text = text.replace(/^\uFEFF/, "");
  const rows = parseCSV(text);
  if (rows.length < 2) { showUploadError("헤더와 도서 정보가 들어 있는 CSV인지 확인해 주세요."); return false; }
  const titleAliases = ["도서명", "서명", "제목", "책제목", "책이름", "도서제목", "자료제목", "책명", "자료명", "표제", "title", "bookname", "booktitle", "itemtitle", "titleofbook"];
  const metadataAliases = ["저자", "저작자", "author", "주제", "분류", "분야", "장르", "category", "subject", "출판사", "발행처", "publisher", "발행년", "출판년", "year", "대출", "이용", "loan", "borrow", "도서관", "library"];
  const detectedHeaderRow = rows.slice(0, 30).findIndex((row, index) => findColumn(row, titleAliases) >= 0 && (index === 0 || findColumn(row, metadataAliases) >= 0));
  const headerRowIndex = detectedHeaderRow >= 0 ? detectedHeaderRow : 0;
  const headers = rows[headerRowIndex].map((header) => header.trim());
  const dataRows = rows.slice(headerRowIndex + 1);
  const titleIndex = findColumn(headers, titleAliases);
  if (titleIndex < 0) {
    showUploadError("도서 제목 열 이름을 자동으로 알아보지 못했어요. 아래에서 제목 열을 직접 골라주세요.");
    pendingCSV = { rows: dataRows, headers, filename };
    titleColumn.innerHTML = headers.map((header, index) => `<option value="${index}">${escapeHTML(header || `열 ${index + 1}`)}</option>`).join("");
    columnMapping.hidden = false;
    return false;
  }
  return applyCSV(dataRows, headers, titleIndex, filename, append);
}

function applyCSV(rows, headers, titleIndex, filename, append = false) {
  const authorIndex = findColumn(headers, ["저자", "저작자", "author"]);
  const isbnIndex = findColumn(headers, ["ISBN", "국제표준도서번호"]);
  const categoryIndex = findColumn(headers, ["주제", "분류", "분야", "장르", "category", "genre", "subject"]);
  const kdcIndex = findColumn(headers, ["KDC", "한국십진분류"]);
  const publisherIndex = findColumn(headers, ["출판사", "발행처", "publisher"]);
  const publicationIndex = findColumn(headers, ["발행사항", "출판사항", "publication"]);
  const yearIndex = findColumn(headers, ["발행년", "발행연도", "출판년", "발행년도", "publicationyear", "year"]);
  const loanIndex = findColumn(headers, ["대출", "이용", "loan", "borrow", "인기도"]);
  const viewsIndex = findColumn(headers, ["조회수", "views"]);
  const libraryIndex = findColumn(headers, ["도서관명", "도서관", "library"]);
  const ratingIndex = findColumn(headers, ["rating", "평점", "별점"]);
  const targetIndex = findColumn(headers, ["대상", "독자대상", "target"]);
  const themeIndex = findColumn(headers, ["테마명", "테마", "theme"]);
  const librarianIndex = findColumn(headers, ["사서추천도서", "추천연월", "librarian"]);
  const taskTopicsIndex = findColumn(headers, ["수행평가활용주제", "활용주제", "assessmenttopic", "tasktopic"]);
  const taskRatingIndex = findColumn(headers, ["수행평가활용도", "활용도", "taskrating", "projectrating"]);
  const difficultyIndex = findColumn(headers, ["난이도", "difficulty", "readinglevel"]);
  const descriptionIndex = findColumn(headers, ["내용", "소개", "요약", "description", "summary"]);
  const isbnSupplementIndex = findColumn(headers, ["ISBN부가기호", "부가기호", "isbnsupplement"]);
  const kdcSubjects = { 0: "총류", 1: "철학", 2: "종교", 3: "사회과학", 4: "자연과학", 5: "기술과학", 6: "예술", 7: "언어", 8: "문학", 9: "역사" };
  const mapped = rows.map((row, index) => {
    const title = textValue(row, titleIndex);
    const loansRaw = textValue(row, loanIndex).replace(/[^\d.-]/g, "");
    const kdc = textValue(row, kdcIndex);
    const publication = textValue(row, publicationIndex);
    const publicationPublisher = publication.match(/[:：]\s*([^,，]+)/)?.[1]?.trim() || "";
    return {
      title,
      author: textValue(row, authorIndex) || "저자 정보 없음",
      isbn: textValue(row, isbnIndex),
      category: textValue(row, themeIndex) || textValue(row, categoryIndex) || (kdc ? `${kdcSubjects[kdc[0]] || "주제"} · KDC ${kdc}` : "공공데이터 도서"),
      publisher: textValue(row, publisherIndex) || publicationPublisher,
      year: textValue(row, yearIndex).match(/\d{4}/)?.[0] || publication.match(/\b(?:19|20)\d{2}\b/)?.[0] || "",
      loans: Number(loansRaw) || 0,
      views: Number(textValue(row, viewsIndex).replace(/[^\d.-]/g, "")) || 0,
      rating: Number(textValue(row, ratingIndex)) || 0,
      taskRating: (textValue(row, taskRatingIndex).match(/★/g) || []).length || Number(textValue(row, taskRatingIndex)) || 0,
      difficulty: textValue(row, difficultyIndex),
      library: textValue(row, libraryIndex),
      target: textValue(row, targetIndex),
      taskTopics: textValue(row, taskTopicsIndex),
      isbnSupplement: textValue(row, isbnSupplementIndex),
      isLibrarianPick: librarianIndex >= 0,
      description: textValue(row, descriptionIndex) || textValue(row, taskTopicsIndex),
      raw: row.join(" "),
      color: index % 6 + 1,
    };
  }).filter((book) => book.title && isStudentAppropriate(book));
  if (!mapped.length) { showUploadError("선택한 열에서 도서 제목을 찾지 못했어요. 다른 열을 골라주세요."); return false; }
  books = append ? books.concat(mapped) : mapped;
  isDemo = false;
  pendingCSV = null;
  columnMapping.hidden = true;
  uploadError.hidden = true;
  renderBooks(interestInput.value.trim());
  document.querySelector("#data-status").textContent = "공공데이터 연결 완료";
  uploadTitle.textContent = "도서 데이터 불러오기 완료";
  uploadDescription.textContent = "이제 업로드한 공공데이터로 책을 추천해요.";
  datasetMeta.hidden = false;
  datasetMeta.textContent = `${filename} · 도서 데이터 ${mapped.length.toLocaleString()}건 · ${headers.length}개 항목`;
  return true;
}

function showUploadError(message) {
  uploadError.textContent = message;
  uploadError.hidden = false;
}

function normalizedQueryTerms(query) {
  const stopWords = new Set(["미치는", "미치", "미친", "영향", "대한", "대해", "관한", "위한", "통해", "어떻게", "무엇", "어떤", "관련", "주제", "수행평가"]);
  return [...new Set(query.toLowerCase().split(/[\s,，、·•\/;:：]+/).map((term) => {
    if (term.length <= 2) return term;
    return term.replace(/(에서|에게|으로|부터|까지|처럼|보다|은|는|이|가|을|를|에|와|과|로|도|만|의)$/u, "");
  }).filter((term) => term.length > 1 && !stopWords.has(term)))];
}

function querySignals(query) {
  const fields = activeSearchMode === "project" && activeProjectContext && query === activeProjectContext.topic
    ? [[activeProjectContext.subject, 0.15], [activeProjectContext.topic, 0.55], [activeProjectContext.direction, 0.3]].filter(([text]) => text.trim())
    : [[query, 1]];
  const totalFieldWeight = fields.reduce((sum, [, weight]) => sum + weight, 0) || 1;
  const weights = new Map();
  fields.forEach(([text, fieldWeight]) => {
    const terms = normalizedQueryTerms(text);
    if (!terms.length) return;
    const termWeight = fieldWeight / totalFieldWeight / terms.length;
    terms.forEach((term) => weights.set(term, (weights.get(term) || 0) + termWeight));
  });
  return [...weights.entries()].map(([term, weight]) => ({ term, weight }));
}

function analyzeQuery(query) {
  return querySignals(query).map(({ term }) => term);
}

function rubricCriterionFit(book, criterion, keywordFit) {
  const label = criterion.label.toLowerCase();
  const content = `${book.title} ${book.category} ${book.description || ""} ${book.taskTopics || ""} ${book.raw}`.toLowerCase();
  if (/분량|자수|시간|제출|작성/.test(label)) return 0.5;
  if (/주제|적합|관련|교과|연계/.test(label)) return keywordFit;
  if (/자료|근거|출처|활용/.test(label)) {
    const detail = Math.min(1, (book.description || "").length / 260);
    const structured = [book.taskTopics, book.publisher, book.isbn, book.loans > 0 ? "대출" : ""].filter(Boolean).length;
    return Math.min(1, 0.25 + detail * 0.35 + Math.min(3, structured) * 0.13);
  }
  if (/분석|비판|사고|논리/.test(label)) {
    const signals = ["분석", "비판", "비교", "원인", "결과", "영향", "관점", "탐구", "문제", "근거"];
    return signals.filter((signal) => content.includes(signal)).length / 6;
  }
  if (/의견|주장|자신|관점|표현/.test(label)) {
    const signals = ["의견", "주장", "토론", "공정", "정의", "판단", "선택", "관점", "논쟁"];
    return signals.filter((signal) => content.includes(signal)).length / 6;
  }
  if (/동기|내용|느낀|변화/.test(label)) return book.description ? 0.75 : book.taskTopics ? 0.6 : 0.4;
  const terms = normalizedQueryTerms(criterion.label);
  return terms.length ? terms.filter((term) => content.includes(term)).length / terms.length : 0;
}

function recordSearch(query, label = query) {
  if (!query.trim() || !analyzeQuery(query).length) return;
  searchHistory.unshift({ query: query.trim(), label: label.trim(), searchedAt: Date.now() });
  searchHistory = searchHistory.slice(0, 30);
  try { localStorage.setItem(searchHistoryStorageKey, JSON.stringify(searchHistory)); } catch { /* Keep the search history for this page session. */ }
}

function weightedSearchTopics() {
  const weights = new Map();
  searchHistory.forEach((entry, index) => {
    const terms = [...new Set(analyzeQuery(entry.query))];
    if (!terms.length) return;
    const recencyWeight = Math.pow(0.88, index) / terms.length;
    terms.forEach((term) => weights.set(term, (weights.get(term) || 0) + recencyWeight));
  });
  return [...weights.entries()].sort((a, b) => b[1] - a[1]);
}

function renderHistoryRecommendations(ranked) {
  historySearchCount.textContent = String(searchHistory.length).padStart(2, "0");
  const weightedTopics = weightedSearchTopics();
  historyKeywords.innerHTML = weightedTopics.slice(0, 5).map(([topic]) => `<span class="history-keyword"># ${escapeHTML(topic)}</span>`).join("");
  clearSearchHistoryButton.hidden = searchHistory.length === 0;
  if (!searchHistory.length) {
    historyRecoCaption.textContent = "검색한 키워드와 관심 분야를 바탕으로 나만의 추천을 만들어요.";
    historyRecommendations.hidden = true;
    historyRecommendations.innerHTML = "";
    historyEmpty.hidden = false;
    historyEmpty.querySelector("p").textContent = "아직 검색 기록이 없어요. 관심 키워드를 검색하면 이 공간에 맞춤 책이 쌓입니다.";
    return;
  }
  const totalWeight = weightedTopics.reduce((sum, [, weight]) => sum + weight, 0) || 1;
  const recommendations = ranked.map((book) => {
    const searchable = `${book.title} ${book.author} ${book.category} ${book.publisher} ${book.description} ${book.raw}`.toLowerCase();
    const matchedTopics = weightedTopics.filter(([topic]) => searchable.includes(topic));
    const historyFit = matchedTopics.reduce((sum, [, weight]) => sum + weight, 0) / totalWeight;
    return { ...book, historyFit, matchedTopics };
  }).filter((book) => book.historyFit > 0)
    .sort((a, b) => b.historyFit - a.historyFit || b.popularity - a.popularity || b.score - a.score)
    .slice(0, 3);
  historyRecoCaption.textContent = `${searchHistory.length}번의 최근 검색을 바탕으로 키워드와 책 소개가 가까운 책을 골랐어요.`;
  historyRecommendations.innerHTML = recommendations.map((book) => {
    const topics = book.matchedTopics.slice(0, 3).map(([topic]) => topic);
    const actionTopic = topics[0] || "";
    return `<article class="history-book-card"><span>${escapeHTML(book.category)}</span><h3>${escapeHTML(book.title)}</h3><p>${escapeHTML(shortBookDescription(book))}</p><button type="button" data-history-topic="${escapeHTML(actionTopic)}">‘${escapeHTML(actionTopic)}’로 더 찾아보기 <span aria-hidden="true">↗</span></button></article>`;
  }).join("");
  historyRecommendations.hidden = recommendations.length === 0;
  historyEmpty.hidden = recommendations.length > 0;
  if (!recommendations.length) historyEmpty.querySelector("p").textContent = "검색 기록과 연결되는 도서를 찾지 못했어요. 다른 키워드도 검색해 보세요.";
}

function rankBooks(query) {
  const signals = querySignals(query);
  const terms = signals.map(({ term }) => term);
  const totalSignalWeight = signals.reduce((sum, signal) => sum + signal.weight, 0) || 1;
  const uniqueBooks = new Map();
  books.forEach((book) => {
    const key = titleKey(book.title);
    const existing = uniqueBooks.get(key);
    if (!existing) {
      uniqueBooks.set(key, { ...book, ratingCount: book.rating > 0 ? 1 : 0, observationCount: 1 });
      return;
    }
    existing.loans += book.loans;
    existing.views = Math.max(existing.views, book.views);
    existing.taskRating = Math.max(existing.taskRating || 0, book.taskRating || 0);
    existing.raw += ` ${book.raw}`;
    existing.observationCount += 1;
    existing.isLibrarianPick ||= book.isLibrarianPick;
    if (book.rating > 0) {
      existing.rating = (existing.rating * existing.ratingCount + book.rating) / (existing.ratingCount + 1);
      existing.ratingCount += 1;
    }
    if (existing.author === "저자 정보 없음" && book.author !== "저자 정보 없음") existing.author = book.author;
    if (!existing.isbn) existing.isbn = book.isbn;
    if ((existing.category === "공공데이터 도서" || /KDC/i.test(existing.category || "")) && book.category !== "공공데이터 도서" && !/KDC/i.test(book.category || "")) existing.category = book.category;
    if (!existing.publisher) existing.publisher = book.publisher;
    if (!existing.year) existing.year = book.year;
    if (!existing.target) existing.target = book.target;
    if (!existing.taskTopics) existing.taskTopics = book.taskTopics;
    if (!existing.difficulty) existing.difficulty = book.difficulty;
    if (!existing.description) existing.description = book.description;
  });
  const uniqueRecords = [...uniqueBooks.values()];
  const maxLoans = Math.max(1, ...uniqueRecords.map((book) => book.loans));
  const maxViews = Math.max(1, ...uniqueRecords.map((book) => book.views || 0));
  const preferredCategories = new Set(uniqueRecords
    .filter((book) => Number(readingRatings[titleKey(book.title)]) >= 4)
    .map(categoryKey)
    .filter(Boolean));
  return uniqueRecords.map((book) => {
    const searchable = `${book.title} ${book.author} ${book.category} ${book.publisher} ${book.raw}`.toLowerCase();
    const matchedSignals = signals.filter(({ term }) => searchable.includes(term));
    const hits = matchedSignals.map(({ term }) => term);
    const matchedFields = [
      ["제목", book.title],
      ["주제", book.category],
      ["책 소개", book.description],
      ["수행평가 활용 주제", book.taskTopics],
      ["저자", book.author],
      ["추천 대상", book.target],
    ].filter(([, value]) => terms.some((term) => String(value || "").toLowerCase().includes(term))).map(([label]) => label);
    const popularity = book.loans > 0 ? Math.log1p(book.loans) / Math.log1p(maxLoans) : book.views > 0 ? Math.log1p(book.views) / Math.log1p(maxViews) : book.rating > 0 ? book.rating / 5 : 0;
    const affinity = preferredCategories.has(categoryKey(book)) ? 0.12 : 0;
    const studentFit = /청소년|초등|중[·ㆍ\s]?고등|중학생|고등학생|학생/.test(book.target || "") ? 1 : book.isLibrarianPick && !/유아/.test(book.target || "") ? 0.65 : book.taskRating > 0 ? 0.9 : 0;
    const usefulnessValue = { helpful: 1, somewhat: 0.35, "not-helpful": -0.7 }[taskUsefulness[titleKey(book.title)]] || 0;
    const keywordFit = matchedSignals.reduce((sum, signal) => sum + signal.weight, 0) / totalSignalWeight;
    const taskRatingFit = book.taskRating > 0 ? Math.min(1, book.taskRating / 5) : 0;
    const rubricMatches = activeSearchMode === "project" ? activeRubric.map((criterion) => ({ ...criterion, fit: rubricCriterionFit(book, criterion, keywordFit) })) : [];
    const rubricScore = rubricMatches.reduce((sum, criterion) => sum + criterion.weight * criterion.fit, 0);
    const studentBoost = activeSearchMode === "project" ? studentFit * 0.07 + taskRatingFit * 0.12 + usefulnessValue * 0.08 : usefulnessValue * 0.025;
    const rubricBoost = activeSearchMode === "project" && activeRubric.length ? rubricScore * 0.2 : 0;
    const keywordWeight = activeSearchMode === "project" && activeRubric.length ? 0.58 : 0.66;
    const score = terms.length ? keywordFit * keywordWeight + popularity * 0.08 + affinity + studentBoost + rubricBoost : popularity * 0.88 + affinity + studentBoost + rubricBoost;
    return { ...book, score, hits, matchedFields, keywordFit, popularity, affinity, studentFit, usefulnessValue, rubricScore, rubricMatches };
  }).sort((a, b) => b.score - a.score || b.loans - a.loans);
}

function reasonFor(book, query) {
  if (query && book.hits.length) return `‘${book.hits.slice(0, 2).join(" · ")}’ 관심사와 연결돼요`;
  if (Number(readingRatings[titleKey(book.title)]) >= 4) return "이전에 높게 평가한 분야와 연결돼요";
  if (book.loans > 0) return `공공데이터 대출 상위 도서${book.year ? ` · ${book.year}년` : ""}`;
  if (book.views > 0) return `사서 추천 도서 · 조회 ${book.views.toLocaleString()}회`;
  if (book.isLibrarianPick) return "국립어린이청소년도서관 사서 추천";
  if (book.rating > 0) return `보조 데이터 평점 ${book.rating.toFixed(1)} 참고`;
  return book.category || "관심 분야와 가까운 도서";
}

function shortBookDescription(book) {
  const description = String(book.description || "").replace(/\s+/g, " ").trim();
  if (description) {
    const firstSentence = description.split(/(?<=[.!?。])\s+/u)[0];
    const characters = Array.from(firstSentence);
    if (characters.length <= 118) return firstSentence;
    return `${characters.slice(0, 112).join("").replace(/\s+\S*$/u, "")}…`;
  }
  const category = book.category && book.category !== "공공데이터 도서" ? book.category : "";
  if (book.target && book.views > 0) return `${book.target} 대상 사서 추천 도서예요. 조회 ${book.views.toLocaleString()}회가 참고 지표로 포함됐어요.`;
  if (book.loans > 0) return `${category ? `${category} 분야에서 ` : ""}공공도서 대출 ${book.loans.toLocaleString()}건을 기록했어요.`;
  if (book.rating > 0) return `${category ? `${category} 분야 · ` : ""}보조 데이터 평점 ${book.rating.toFixed(1)}점.`;
  return category ? `${category} 분야의 책이에요.` : "도서 제목과 주제 정보를 바탕으로 추천해요.";
}

function estimateDifficulty(book) {
  const explicit = String(book.difficulty || "").toLowerCase();
  if (/기초|쉬움|초급|easy|beginner/.test(explicit)) return { level: "basic", label: "기초", reason: "제공된 난이도 정보 기준이에요." };
  if (/심화|어려움|고급|advanced|hard/.test(explicit)) return { level: "challenging", label: "도전", reason: "제공된 난이도 정보 기준이에요." };
  if (/보통|중급|standard|intermediate/.test(explicit)) return { level: "standard", label: "보통", reason: "제공된 난이도 정보 기준이에요." };
  const text = `${book.title} ${book.category} ${book.description || ""} ${book.taskTopics || ""}`;
  let score = 0;
  if (/입문|첫걸음|초보|기초|쉽게|알기 쉬운|쉬운/.test(text)) score -= 1;
  if (/심화|전공|학술|논문|비판적 사고|이론|통계학|미적분|양자역학|철학사|사회학|데이터 분석|정치경제|법학/.test(text)) score += 1;
  if (/중학생/.test(book.target || "")) score -= 0.25;
  if (/고등학생|대학생/.test(book.target || "")) score += 0.2;
  if (Array.from(book.description || "").length > 650) score += 0.15;
  if (score <= -0.55) return { level: "basic", label: "기초", reason: "입문·기초 표현과 추천 대상을 참고한 예상 수준이에요." };
  if (score >= 0.95) return { level: "challenging", label: "도전", reason: "전문 개념과 주제 정보를 참고한 예상 수준이에요." };
  return { level: "standard", label: "보통", reason: "학생 추천 대상과 주제 정보를 참고한 예상 수준이에요." };
}

function buildInquiryQuestions(book) {
  const subject = activeProjectContext?.subject || "";
  const topic = activeProjectContext?.topic || activeQuery || book.title;
  const direction = activeProjectContext?.direction || "";
  const rubricText = activeRubric.map((criterion) => criterion.label).join(" ");
  const context = `${subject} ${topic} ${direction} ${book.title} ${book.category} ${book.taskTopics || ""} ${rubricText}`.toLowerCase();
  if (activeRubric.length) {
    const findCriterion = (pattern, fallback) => activeRubric.find((criterion) => pattern.test(criterion.label))?.label || fallback;
    const topicCriterion = findCriterion(/주제|적합|관련/, "주제 연결");
    const sourceCriterion = findCriterion(/자료|근거|출처|활용/, "자료 활용");
    const analysisCriterion = findCriterion(/분석|비판|사고|논리/, "분석 및 비판적 사고");
    const opinionCriterion = findCriterion(/의견|주장|자신|표현/, "자신의 의견");
    return [
      `‘${topic}’과 이 책의 내용은 어떤 점에서 연결되며, 핵심 사례는 무엇일까? (${topicCriterion})`,
      `책의 자료와 근거를 비교하면 ‘${topic}’의 원인·영향에 대해 어떤 분석을 할 수 있을까? (${sourceCriterion} · ${analysisCriterion})`,
      `분석한 근거를 바탕으로 ‘${topic}’에 대해 나는 어떤 결론이나 대안을 제시할 수 있을까? (${opinionCriterion})`,
    ];
  }
  if (/인공지능|\bai\b|알고리즘/.test(context)) return [
    "인공지능의 발전은 노동시장과 일자리에 어떤 변화를 가져올까?",
    "인공지능을 활용한 의사결정은 항상 공정할까?",
    "인공지능 기술로 생기는 사회적 문제를 해결하려면 어떤 기준과 제도가 필요할까?",
  ];
  if (/기후|환경|생태|바다|탄소|에너지/.test(context)) return [
    "기후 변화는 생태계와 사람들의 생활에 어떤 영향을 미칠까?",
    "환경 문제의 책임과 피해는 지역·세대 사이에 공정하게 나뉘고 있을까?",
    "개인·기업·정부는 환경 문제를 줄이기 위해 어떤 대안을 실천할 수 있을까?",
  ];
  if (/경제|금융|소비|시장|노동|일자리/.test(context)) return [
    "이 주제는 개인의 소비와 가계 경제에 어떤 영향을 줄까?",
    "시장과 일자리의 변화로 이익을 얻는 집단과 어려움을 겪는 집단은 누구일까?",
    "경제적 격차를 줄이기 위해 개인과 사회는 어떤 대안을 선택할 수 있을까?",
  ];
  if (/인권|정의|공정|차별|평등|민주/.test(context)) return [
    "이 주제와 관련된 권리와 책임은 누구에게 어떻게 적용될까?",
    "현재의 제도나 판단은 모든 사람에게 공정하다고 볼 수 있을까?",
    "불평등이나 차별을 줄이기 위해 어떤 제도적 대안이 필요할까?",
  ];
  if (/역사|전쟁|독립|민주화|사건/.test(context)) return [
    "이 사건이 일어난 원인과 당시 사람들의 선택은 무엇이었을까?",
    "이 사건은 서로 다른 집단에 어떤 영향을 남겼을까?",
    "이 역사를 오늘날의 사회 문제와 연결하면 어떤 교훈을 얻을 수 있을까?",
  ];
  const focus = normalizedQueryTerms(`${topic} ${book.taskTopics || ""}`).slice(0, 2).join("·") || book.category || book.title;
  return [
    `‘${focus}’는 사회와 사람들의 생활에 어떤 변화를 만들까?`,
    `‘${focus}’와 관련된 선택이나 판단은 누구에게 이익과 부담을 주며, 공정할까?`,
    `‘${focus}’에서 발견한 문제를 해결하기 위해 학교·지역사회·정부는 어떤 대안을 마련할 수 있을까?`,
  ];
}

function cardMarkup(book, index, query, featuredRank = 0) {
  const category = book.category || "추천 도서";
  const savedRating = Number(readingRatings[titleKey(book.title)]) || 0;
  const difficulty = estimateDifficulty(book);
  const studentBadge = activeSearchMode === "project" && book.studentFit >= 0.6 ? `<span class="student-fit-badge">학생 추천 데이터</span>` : "";
  const featuredBadge = featuredRank ? `<span class="best3-rank">BEST 0${featuredRank}</span>` : "";
  const stat = isDemo ? `<span class="book-stat">예시 목록</span>` : book.loans > 0 ? `<span class="book-stat">대출 <strong>${book.loans.toLocaleString()}</strong></span>` : book.views > 0 ? `<span class="book-stat">조회 <strong>${book.views.toLocaleString()}</strong></span>` : book.rating > 0 ? `<span class="book-stat">평점 <strong>${book.rating.toFixed(1)}</strong></span>` : "";
  const summary = shortBookDescription(book);
  const detail = book.library ? `도서관 · ${escapeHTML(book.library)}` : book.target ? `추천 대상 · ${escapeHTML(book.target)}` : "";
  const detailMarkup = detail ? `<p class="book-library">${detail}</p>` : "";
  const stars = [1, 2, 3, 4, 5].map((rating) => `<button class="rating-star" type="button" data-book-key="${escapeHTML(titleKey(book.title))}" data-book-rating="${rating}" aria-label="${escapeHTML(book.title)} ${rating}점으로 평가" aria-pressed="${rating <= savedRating}">${rating <= savedRating ? "★" : "☆"}</button>`).join("");
  const ratingMarkup = `<div class="book-rating"><span class="rating-label">내 평가</span><div class="rating-stars">${stars}</div><span class="book-rating-output">${savedRating ? `${savedRating}점` : "별점 선택"}</span></div>`;
  return `<article class="book-card${featuredRank ? " best3-card" : ""}" data-open-book-key="${escapeHTML(titleKey(book.title))}">
    <div class="book-cover cover-${book.color || index % 6 + 1}" aria-hidden="true"><span class="cover-kicker">BOOK PATH · ${String(index + 1).padStart(2, "0")}</span><span class="cover-title">${escapeHTML(book.title)}</span><span class="cover-foot">READING IS A JOURNEY</span></div>
    <div class="book-info">${featuredBadge}${studentBadge}${stat}<div class="book-category-line"><span class="book-category">${escapeHTML(category)}</span><span class="difficulty-badge difficulty-${difficulty.level}">${difficulty.label}</span></div><h3 class="book-title"><button class="book-detail-trigger" type="button" data-open-book-key="${escapeHTML(titleKey(book.title))}" aria-label="${escapeHTML(book.title)} 상세 보기">${escapeHTML(book.title)}</button></h3><p class="book-author">${escapeHTML(book.author)}${book.year ? ` · ${escapeHTML(book.year)}` : ""}</p><p class="book-summary">${escapeHTML(summary)}</p>${detailMarkup}<p class="book-reason"><span>✳</span>${escapeHTML(reasonFor(book, query))}</p>${ratingMarkup}</div>
  </article>`;
}

function reportExplanation(book, query) {
  const terms = book.hits.slice(0, 3);
  const fields = book.matchedFields.length ? book.matchedFields.slice(0, 3).join("·") : "도서 정보";
  const matchSentence = terms.length
    ? `‘${terms.join("·")}’ 키워드가 ${fields}에서 확인됐어요.`
    : `입력한 주제와 직접 일치하는 책은 적어 대출·평점 데이터를 중심으로 골랐어요.`;
  let dataSentence = `주제 분야는 ${book.category}예요.`;
  if (book.taskRating > 0) dataSentence = `수행평가 활용도 ${book.taskRating}/5점 자료도 반영했어요.`;
  else if (book.loans > 0) dataSentence = `공공데이터 대출 ${book.loans.toLocaleString()}건도 참고했어요.`;
  else if (book.views > 0) dataSentence = `사서 추천 도서 조회 ${book.views.toLocaleString()}회도 참고했어요.`;
  else if (book.rating > 0) dataSentence = `보조 데이터 평점 ${book.rating.toFixed(1)}점도 반영했어요.`;
  else if (Number(readingRatings[titleKey(book.title)]) >= 4) dataSentence = "이전에 높게 평가한 분야와도 연결돼요.";
  const rubricEvidence = (book.rubricMatches || []).filter((criterion) => criterion.fit >= 0.35).sort((a, b) => b.weight * b.fit - a.weight * a.fit)[0];
  if (rubricEvidence) dataSentence = `${rubricEvidence.unweighted ? "동일 비중" : `배점 ${rubricEvidence.points}점`}으로 반영된 ‘${rubricEvidence.label}’ 기준에 맞는 정보가 있어요.`;
  return `${matchSentence} ${dataSentence}`;
}

function fieldSimilarities(matches) {
  const fields = new Map();
  matches.forEach((book) => {
    const key = categoryKey(book) || "기타";
    const label = (book.category || "기타").split(/[·/|]/, 1)[0].trim() || "기타";
    const current = fields.get(key) || { label, fitTotal: 0, count: 0 };
    current.fitTotal += book.keywordFit;
    current.count += 1;
    fields.set(key, current);
  });
  return [...fields.values()].map((field) => {
    const averageFit = field.fitTotal / field.count;
    const coverage = Math.min(1, field.count / 3);
    return { ...field, similarity: Math.min(100, Math.round((averageFit * 0.82 + coverage * 0.18) * 100)) };
  }).sort((a, b) => b.similarity - a.similarity || b.count - a.count).slice(0, 5);
}

function fieldSimilarityMarkup(matches) {
  const similarities = fieldSimilarities(matches);
  if (!similarities.length) return `<p class="similarity-empty">검색어와 직접 연결된 분야를 찾지 못해 대출·평점 기준으로 책을 보여드려요.</p>`;
  return similarities.map((field) => `<div class="similarity-row"><div class="similarity-labels"><span>${escapeHTML(field.label)}</span><span>${field.similarity}%</span></div><div class="similarity-track" role="progressbar" aria-label="${escapeHTML(field.label)} 분야 유사도" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${field.similarity}"><span style="width:${field.similarity}%"></span></div></div>`).join("");
}

function renderAnalysisReport(query, matches, ranked) {
  if (!query) {
    analysisReport.hidden = true;
    analysisReport.innerHTML = "";
    return;
  }
  const terms = analyzeQuery(query);
  const reportBooks = (matches.length ? matches : ranked).slice(0, 3);
  const termChips = terms.length ? terms.map((term) => `<span class="report-term">${escapeHTML(term)}</span>`).join("") : `<span class="report-term">일반 검색어</span>`;
  const booksMarkup = reportBooks.map((book, index) => {
    const evidence = matches.length ? `<span class="report-fit">키워드 일치 ${Math.round(book.keywordFit * 100)}%</span>` : `<span class="report-fit">대출·평점 참고</span>`;
    return `<article class="analysis-book"><div class="analysis-book-head"><span class="analysis-rank">0${index + 1}</span><h4>${escapeHTML(book.title)}</h4>${evidence}</div><p>${escapeHTML(reportExplanation(book, query))}</p></article>`;
  }).join("");
  const summary = activeSearchMode === "project" && activeProjectContext
    ? `과목·주제·탐구 방향${activeRubric.length ? `과 평가 기준 ${activeRubric.length}개` : ""}를 함께 분석했어요. 배점이 큰 기준과 주제 키워드에 더 맞는 책을 우선합니다.`
    : matches.length
      ? `입력한 검색어에서 핵심 키워드 ${terms.length}개를 추려 책 제목·주제·소개와 비교했어요. 상위 추천 이유를 확인해 보세요.`
      : "직접 일치하는 제목·소개 키워드가 없어 대출량과 평점이 있는 책을 참고 추천으로 보여드려요.";
  const projectContextMarkup = activeSearchMode === "project" && activeProjectContext
    ? `<div class="report-project-context"><span><b>과목</b>${escapeHTML(activeProjectContext.subject || "미입력")}</span><span><b>주제</b>${escapeHTML(activeProjectContext.topic || "")}</span><span><b>탐구 방향</b>${escapeHTML(activeProjectContext.direction || "미입력")}</span></div>`
    : "";
  const rubricContextMarkup = activeSearchMode === "project" && activeRubric.length
    ? `<div class="report-rubric-context"><strong>반영한 평가 기준</strong><div>${activeRubric.map((criterion) => `<span>${escapeHTML(criterion.label)} · ${criterion.unweighted ? `동일 비중 ${Math.round(criterion.weight * 100)}%` : `${criterion.points}점`}</span>`).join("")}</div></div>`
    : "";
  const rubricWeightNote = activeRubric.length ? activeRubric.every((criterion) => criterion.unweighted) ? "업로드한 배점 없는 기준은 동일 비중으로 반영" : "업로드한 기준은 배점 비율로 반영" : "평가 기준표 없이 추천";
  const modelFootnote = activeSearchMode === "project"
    ? `과목·주제·탐구 방향을 15:55:30 기본 비중으로 비교하고, ${rubricWeightNote}해요. 학생 대상·활용도와 공개 대출 지표도 포함한 설명 가능한 추천 프로토타입입니다.`
    : "키워드 일치도, 공공 대출·조회 지표, 이전 별점을 조합한 설명 가능한 프로토타입 결과예요. 학습형 외부 AI 모델은 연결하지 않았어요.";
  const evaluatedCount = matches.filter((book) => Number(readingRatings[titleKey(book.title)]) > 0).length;
  const metricMarkup = [
    [matches.length, "분석 도서 수"],
    [terms.length, "핵심 키워드"],
    [new Set(matches.map(categoryKey).filter(Boolean)).size, "관련 분야 수"],
    [evaluatedCount, "별점 남긴 책"],
  ].map(([value, label]) => `<div class="report-metric"><strong>${value}</strong><span>${label}</span></div>`).join("");
  const similarityMarkup = fieldSimilarityMarkup(matches);
  analysisReport.innerHTML = `<div class="report-heading"><div><span class="section-kicker">EXPLAINABLE RECOMMENDATION</span><h3 id="analysis-report-title">AI 추천 분석 리포트</h3><p>${escapeHTML(summary)}</p></div><span class="report-mark" aria-hidden="true">AI</span></div>${projectContextMarkup}${rubricContextMarkup}<div class="report-metrics">${metricMarkup}</div><div class="report-terms"><span class="report-label">분석 키워드</span>${termChips}</div><section class="similarity-panel" aria-labelledby="similarity-heading"><div class="similarity-heading"><h4 id="similarity-heading">관심 분야 유사도</h4><p>검색 키워드와 도서 분야·소개가 얼마나 겹치는지 보여줘요.</p></div>${similarityMarkup}</section><div class="analysis-books">${booksMarkup}</div><p class="report-footnote">${escapeHTML(modelFootnote)}</p>`;
  analysisReport.hidden = false;
}

function getBalancedBundle(matches) {
  if (matches.length < 3) return [];
  const intro = matches[0];
  const remaining = matches.slice(1);
  const perspective = remaining.find((book) => categoryKey(book) !== categoryKey(intro))
    || remaining.find((book) => book.author !== intro.author)
    || remaining[0];
  const advanced = matches.filter((book) => book !== intro && book !== perspective).sort((a, b) => {
    const detailScore = (book) => (book.description || "").length + (book.target ? 30 : 0) + (book.category || "").length;
    return b.keywordFit - a.keywordFit || detailScore(b) - detailScore(a) || b.score - a.score;
  })[0];
  return [
    { book: intro, label: "01 · 입문", note: "검색 주제와 가장 가까운 책부터 핵심을 잡아봐요." },
    { book: perspective, label: "02 · 다른 관점", note: categoryKey(perspective) !== categoryKey(intro) ? `다른 분야인 ${perspective.category}의 시각을 더해요.` : "다른 저자와 책의 시각을 비교해 주제를 넓혀봐요." },
    { book: advanced, label: "03 · 심화 탐구", note: advanced.description ? "소개와 주제 정보를 살펴 탐구 근거를 넓혀봐요." : "분야·추천 대상 정보를 활용해 탐구를 확장해 봐요." },
  ];
}

function balancedBundleMarkup(bundle, titleId = "bundle-title") {
  return `<div class="bundle-heading"><div><span class="section-kicker">A BALANCED READING PATH</span><h3 id="${titleId}">한 주제를 세 가지 관점으로 읽어요<span class="heading-period">.</span></h3><p>입문부터 다른 관점, 심화 탐구까지 이어지는 책 조합이에요.</p></div><span class="bundle-count">3 BOOKS</span></div><div class="bundle-grid">${bundle.map(({ book, label, note }) => { const difficulty = estimateDifficulty(book); return `<article class="bundle-card"><span class="bundle-role">${label} · ${difficulty.label}</span><h4>${escapeHTML(book.title)}</h4><p class="bundle-category">${escapeHTML(book.category)}</p><p class="bundle-summary">${escapeHTML(shortBookDescription(book))}</p><p class="bundle-note">${escapeHTML(note)}</p></article>`; }).join("")}</div><p class="bundle-footnote">입문·심화는 공식 난이도 등급이 아니에요. 키워드 적합도, 분야 다양성, 소개 정보량을 활용한 읽기 순서 제안입니다.</p>`;
}

function renderBalancedBundle(query, matches) {
  const bundle = query && !isDemo ? getBalancedBundle(matches) : [];
  if (!bundle.length) {
    balancedBundle.hidden = true;
    balancedBundle.innerHTML = "";
    return;
  }
  balancedBundle.innerHTML = balancedBundleMarkup(bundle);
  balancedBundle.hidden = false;
}

function renderBookDetail(bookKey, countView = true) {
  const sourceBook = currentRankedBooks.find((book) => titleKey(book.title) === bookKey);
  if (!sourceBook) return;
  if (countView) {
    recordBookView(sourceBook);
    renderInsights(currentRankedBooks);
  }
  selectedBookKey = bookKey;
  const detailTopic = activeQuery && sourceBook.hits.length ? activeQuery : categoryKey(sourceBook) || sourceBook.title;
  const topicBooks = rankBooks(detailTopic);
  const book = topicBooks.find((item) => titleKey(item.title) === bookKey) || sourceBook;
  const topicMatches = topicBooks.filter((item) => item.hits.length > 0);
  const bundle = getBalancedBundle(topicMatches);
  const feedback = taskUsefulness[bookKey] || "";
  const difficulty = estimateDifficulty(book);
  currentInquiryQuestions = buildInquiryQuestions(book);
  selectedInquiryIndex = -1;
  const feedbackLabels = { helpful: "도움 됐어요", somewhat: "조금 도움 됐어요", "not-helpful": "도움 되지 않았어요" };
  const signalLabel = book.studentFit >= 0.6 ? "학생·청소년 추천 대상 또는 사서 추천 정보가 있어요." : "주제 키워드 일치도를 중심으로 추천했어요.";
  const evidence = [];
  if (book.loans > 0) evidence.push(`공공 대출 ${book.loans.toLocaleString()}건`);
  if (book.views > 0) evidence.push(`사서 추천 조회 ${book.views.toLocaleString()}회`);
  if (book.taskRating > 0) evidence.push(`수행평가 활용도 ${book.taskRating}/5점`);
  if (book.rating > 0) evidence.push(`보조 평점 ${book.rating.toFixed(1)}점`);
  const bestRubricEvidence = (book.rubricMatches || []).filter((criterion) => criterion.fit >= 0.35).sort((a, b) => b.weight * b.fit - a.weight * a.fit)[0];
  if (bestRubricEvidence) evidence.push(`평가 기준 ${bestRubricEvidence.label} · ${bestRubricEvidence.unweighted ? `동일 비중 ${Math.round(bestRubricEvidence.weight * 100)}%` : `${bestRubricEvidence.points}점`}`);
  const report = reportExplanation(book, detailTopic);
  const reportMatch = book.hits.length ? `${Math.round(book.keywordFit * 100)}% 키워드 일치` : "주제·인기도 참고";
  const detailSimilarity = fieldSimilarityMarkup(topicMatches);
  const inquiryContext = activeProjectContext ? `${activeProjectContext.subject || "과목 미입력"} · ${activeProjectContext.topic}` : `${book.category} · ${activeQuery || book.title}`;
  const inquiryMarkup = `<section class="detail-inquiry-panel"><div class="inquiry-panel-head"><span class="insight-overline">RESEARCH QUESTION STARTER</span><h2>탐구 질문 예시</h2><p>${escapeHTML(inquiryContext)}에서 더 파고들 질문을 골라보세요.</p></div><div class="inquiry-question-list">${currentInquiryQuestions.map((question, index) => `<button type="button" class="inquiry-question" data-inquiry-index="${index}" aria-pressed="false"><span class="inquiry-number">0${index + 1}</span><span class="inquiry-question-text">${escapeHTML(question)}</span><span class="inquiry-select-label">선택</span></button>`).join("")}</div><div class="inquiry-footer"><p id="inquiry-choice-status">질문을 선택하면 수행평가 탐구 방향 칸에 넣을 수 있어요.</p><button type="button" id="apply-inquiry-question" disabled>이 질문을 탐구 방향에 넣기 <span aria-hidden="true">↗</span></button></div></section>`;
  const purchaseQuery = encodeURIComponent(`${book.title} ${book.author === "저자 정보 없음" ? "" : book.author}`.trim());
  const purchaseStores = [
    ["교보문고", `https://search.kyobobook.co.kr/search?keyword=${purchaseQuery}`],
    ["알라딘", `https://www.aladin.co.kr/search/wsearchresult.aspx?SearchWord=${purchaseQuery}`],
    ["YES24", `https://www.yes24.com/product/search?query=${purchaseQuery}`],
  ];
  bookDetailContent.innerHTML = `<article class="book-detail">
    <header class="detail-book-header">
      <div class="book-cover detail-cover cover-${book.color || 1}" aria-hidden="true"><span class="cover-kicker">BOOK PATH · DETAIL</span><span class="cover-title">${escapeHTML(book.title)}</span><span class="cover-foot">READING IS A JOURNEY</span></div>
      <div class="detail-title-copy"><div class="detail-labels"><span class="book-category">${escapeHTML(book.category)}</span><span class="difficulty-badge difficulty-${difficulty.level}">${difficulty.label} 난이도</span>${book.studentFit >= 0.6 ? `<span class="student-fit-badge">학생 추천 데이터</span>` : ""}</div><h1>${escapeHTML(book.title)}</h1><p class="detail-author">${escapeHTML(book.author)}${book.year ? ` · ${escapeHTML(book.year)}` : ""}${book.publisher ? ` · ${escapeHTML(book.publisher)}` : ""}</p><p class="detail-description">${escapeHTML(shortBookDescription(book))}</p><p class="detail-difficulty-reason">${escapeHTML(difficulty.reason)}</p>${book.target ? `<p class="detail-target">추천 대상 · ${escapeHTML(book.target)}</p>` : ""}</div>
    </header>
    <div class="detail-panels">
      <section class="detail-analysis-panel"><span class="insight-overline">WHY THIS BOOK?</span><h2>AI 추천 분석 리포트</h2><p class="detail-report-copy">${escapeHTML(report)}</p><div class="detail-evidence"><span>${reportMatch}</span><span>${escapeHTML(signalLabel)}</span>${evidence.map((item) => `<span>${escapeHTML(item)}</span>`).join("")}</div><section class="similarity-panel detail-similarity-panel"><div class="similarity-heading"><h4>관심 분야 유사도</h4><p>같은 검색 주제의 책들을 분야별로 비교했어요.</p></div>${detailSimilarity}</section></section>
      <section class="task-evaluation-panel"><span class="insight-overline">STUDENT FEEDBACK</span><h2>수행평가에 도움이 됐나요?</h2><p>이 책이 주제 이해나 자료 조사에 얼마나 도움이 되었는지 알려주세요.</p><div class="task-feedback-options">${[["helpful", "도움 됐어요"], ["somewhat", "조금 도움 됐어요"], ["not-helpful", "도움 되지 않았어요"]].map(([value, label]) => `<button type="button" data-task-feedback="${value}" aria-pressed="${feedback === value}">${label}</button>`).join("")}</div><p class="task-feedback-status">${feedback ? `평가 저장됨 · ${feedbackLabels[feedback]}` : "평가는 이 브라우저에 저장되어 다음 수행평가 추천에 반영돼요."}</p></section>
    </div>
    ${inquiryMarkup}
    <section class="purchase-panel"><div><span class="insight-overline">FIND THIS BOOK</span><h2>구매처에서 책 찾기</h2><p>제목과 저자로 서점 검색을 열어요. 가격과 재고는 각 서점에서 확인해 주세요.</p></div><div class="purchase-links">${purchaseStores.map(([name, url]) => `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${name}<span aria-hidden="true">↗</span></a>`).join("")}</div></section>
    ${bundle.length ? `<section class="detail-bundle-panel">${balancedBundleMarkup(bundle, "detail-bundle-title")}</section>` : `<section class="detail-bundle-panel detail-bundle-empty"><h2>한 주제를 세 가지 관점으로 읽어요</h2><p>이 책과 주제가 가까운 책이 더 모이면 입문·다른 관점·심화 조합을 보여드릴게요.</p></section>`}
  </article>`;
  showView("book-detail");
}

function searchTimelineMarkup() {
  const recentSearches = searchHistory.slice(0, 6).reverse();
  if (!recentSearches.length) return `<p class="visual-empty">검색 기록이 생기면 관심 주제가 시간순으로 표시돼요.</p>`;
  return `<ol class="search-timeline">${recentSearches.map((entry) => {
    const date = entry.searchedAt ? new Date(entry.searchedAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }) : "최근";
    return `<li><time>${date}</time><span>${escapeHTML(entry.label || entry.query)}</span></li>`;
  }).join("")}</ol>`;
}

function viewedCategoryMarkup() {
  if (!viewedBookHistory.length) return `<p class="visual-empty">책 상세 화면을 열면 분야별 열람 비율이 여기에 쌓여요.</p>`;
  const counts = new Map();
  viewedBookHistory.forEach((entry) => counts.set(entry.category, (counts.get(entry.category) || 0) + 1));
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const visible = sorted.slice(0, 4).map(([label, count]) => ({ label, count }));
  const hiddenCount = sorted.slice(4).reduce((sum, [, count]) => sum + count, 0);
  if (hiddenCount) visible.push({ label: "기타 분야", count: hiddenCount });
  let usedPercent = 0;
  const bars = visible.map((field, index) => {
    const percent = index === visible.length - 1 ? 100 - usedPercent : Math.round(field.count / viewedBookHistory.length * 100);
    usedPercent += percent;
    return `<div class="viewed-field-row"><div class="viewed-field-label"><span>${escapeHTML(field.label)}</span><span>${percent}% <small>· ${field.count}회</small></span></div><div class="viewed-field-track" role="progressbar" aria-label="${escapeHTML(field.label)} 열람 비율" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div></div>`;
  }).join("");
  return `<div class="viewed-field-total">최근 ${viewedBookHistory.length}회 열람</div>${bars}`;
}

function renderInsights(recommendations) {
  const ratedBooks = recommendations.map((book) => ({ ...book, userRating: Number(readingRatings[titleKey(book.title)]) || 0 })).filter((book) => book.userRating > 0);
  const categoryScores = new Map();
  ratedBooks.filter((book) => book.userRating >= 4).forEach((book) => {
    const category = categoryKey(book);
    if (!category) return;
    categoryScores.set(category, (categoryScores.get(category) || 0) + book.userRating);
  });
  const preferredCategories = [...categoryScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([category]) => category);
  const preferredSet = new Set(preferredCategories);
  const knownCategories = new Set(ratedBooks.map(categoryKey).filter(Boolean));
  const similarBooks = preferredSet.size ? recommendations.filter((book) => preferredSet.has(categoryKey(book))) : [];
  const explorationBooks = [];
  const seenExploreCategories = new Set(knownCategories);
  recommendations.filter((book) => !Number(readingRatings[titleKey(book.title)])).forEach((book) => {
    const category = categoryKey(book);
    if (!category || seenExploreCategories.has(category) || explorationBooks.length >= 3) return;
    seenExploreCategories.add(category);
    explorationBooks.push(book);
  });
  const totalLoans = recommendations.reduce((sum, book) => sum + book.loans, 0);
  const similarLoans = similarBooks.reduce((sum, book) => sum + book.loans, 0);
  const loanShare = totalLoans ? Math.round(similarLoans / totalLoans * 100) : 0;
  const ratedSimilarBooks = similarBooks.filter((book) => book.rating > 0);
  const averageSimilarRating = ratedSimilarBooks.length ? ratedSimilarBooks.reduce((sum, book) => sum + book.rating, 0) / ratedSimilarBooks.length : 0;
  const categoryTags = preferredCategories.map((category) => `<span>${escapeHTML(category)}</span>`).join("");
  const historyCopy = ratedBooks.length
    ? `<p>별점 ${ratedBooks.length}권 · 4점 이상 평가한 분야를 추천 순위에 반영해요.</p>${categoryTags ? `<div class="insight-categories">${categoryTags}</div>` : `<p class="insight-hint">4점 이상 평가가 쌓이면 선호 분야를 더 정확히 찾을 수 있어요.</p>`}`
    : `<p>책 카드의 별점을 눌러 읽은 책을 평가해 보세요. 평가는 이 기기에만 저장돼요.</p>`;
  const preferenceCopy = preferredSet.size
    ? `<div class="insight-number">${loanShare}<small>%</small></div><p>내가 높게 평가한 분야가 전체 공공 대출에서 차지하는 비중이에요. 유사 분야 도서 ${similarBooks.length}개를 분석했어요.${averageSimilarRating ? ` 보조 데이터 평균 평점 ${averageSimilarRating.toFixed(1)}점.` : ""}</p>`
    : `<h3>평가를 남기면 분석을 시작해요.</h3><p>별점 기록을 바탕으로 관심 분야를 찾고, 같은 분야의 대출량·평점을 비교해 선호를 추정해요.</p>`;
  const explorationMarkup = explorationBooks.length
    ? `<div class="discovery-book-grid">${explorationBooks.map((book) => `<article class="discovery-book"><span>${escapeHTML(book.category)}</span><h4>${escapeHTML(book.title)}</h4><p>${escapeHTML(shortBookDescription(book))}</p><button type="button" data-discover-topic="${escapeHTML(categoryKey(book))}">이 분야 더 보기 <span aria-hidden="true">↗</span></button></article>`).join("")}</div>`
    : `<p class="discovery-empty">새로운 분야 후보가 적어요. 다른 책에 별점을 남기면 더 다양한 주제를 찾아볼게요.</p>`;
  const visualizationsMarkup = `<div class="taste-visualizations"><article class="taste-visual-card"><span class="insight-overline">SEARCH JOURNEY</span><h3>탐구 관심 변화</h3><p>최근 검색한 수행평가 주제를 시간순으로 보여줘요.</p>${searchTimelineMarkup()}</article><article class="taste-visual-card"><span class="insight-overline">READING MIX</span><h3>열어 본 책의 분야 비율</h3><p>책 상세 화면을 연 횟수를 분야별 백분율로 비교해요.</p>${viewedCategoryMarkup()}</article></div>`;
  readingInsights.innerHTML = `<div class="insight-grid">
    <article class="insight-card"><span class="insight-overline">MY READING HISTORY</span><h3>${ratedBooks.length ? `평가한 책 ${ratedBooks.length}권` : "내 독서 취향 기록"}</h3>${historyCopy}</article>
    <article class="insight-card peer-card"><span class="insight-overline">SIMILAR TOPIC SIGNAL · ESTIMATE</span><h3>비슷한 관심사 독자 선호도 (추정)</h3>${preferenceCopy}</article>
    <article class="insight-card discovery-card"><span class="insight-overline">STEP OUTSIDE YOUR SHELF</span><h3>취향 확장 추천 · 내가 몰랐던 분야</h3><p>평가한 분야와 다른 주제에서 새 책을 발견해 보세요.</p>${explorationMarkup}</article>
  </div>${visualizationsMarkup}<p class="insight-disclaimer">실제 이용자별 독서 기록을 비교하지 않아요. 공개 대출량과 보조 CSV의 평점을 비슷한 주제별로 묶어 참고 지표로 보여드립니다. 검색 및 열람 기록은 이 브라우저에 저장돼요.</p>`;
}

function renderBooks(query = "", append = false) {
  if (!append) visibleBookCount = 12;
  activeQuery = query;
  const ranked = rankBooks(query);
  currentRankedBooks = ranked;
  const matches = query ? ranked.filter((book) => book.hits.length > 0) : ranked;
  const withinDifficulty = (book) => difficultyFilter === "all" || estimateDifficulty(book).level === difficultyFilter;
  const filteredMatches = matches.filter(withinDifficulty);
  const filteredRanked = ranked.filter(withinDifficulty);
  const availableBooks = query && matches.length ? filteredMatches : filteredRanked;
  const results = availableBooks.slice(0, visibleBookCount);
  const isAssessmentSearch = activeSearchMode === "project" && Boolean(query) && matches.length > 0;
  const bestBooks = isAssessmentSearch ? results.slice(0, 3) : [];
  const otherBooks = isAssessmentSearch ? results.slice(3) : results;
  if (best3Grid) best3Grid.innerHTML = bestBooks.map((book, index) => cardMarkup(book, index, query, index + 1)).join("");
  if (best3Section) best3Section.hidden = bestBooks.length === 0;
  if (otherBooksHeading) otherBooksHeading.hidden = !isAssessmentSearch || otherBooks.length === 0;
  if (otherBooksCount) otherBooksCount.textContent = `${Math.max(0, filteredMatches.length - 3)}권`;
  grid.innerHTML = otherBooks.map((book, index) => cardMarkup(book, index + (bestBooks.length ? 3 : 0), matches.length ? query : "")).join("");
  grid.hidden = otherBooks.length === 0;
  emptyState.hidden = results.length > 0;
  if (query && matches.length && !filteredMatches.length) {
    emptyState.querySelector("h3").textContent = "선택한 난이도의 책이 없어요.";
    emptyState.querySelector("p").textContent = "난이도 필터를 ‘모든 난이도’로 바꾸거나 다른 수준을 선택해 보세요.";
  } else {
    emptyState.querySelector("h3").textContent = "아직 꼭 맞는 책을 찾지 못했어요.";
    emptyState.querySelector("p").textContent = "다른 관심사를 입력하거나 CSV에 책 제목과 주제 정보가 있는지 확인해 주세요.";
  }
  resultCount.textContent = String(query && matches.length ? filteredMatches.length : filteredRanked.length).padStart(2, "0");
  resultCountLabel.textContent = query && matches.length ? "MATCHES" : "TITLES";
  showMoreButton.hidden = results.length >= availableBooks.length;
  showMoreButton.textContent = `더 많은 책 보기 (${Math.min(12, availableBooks.length - results.length)}권)`;
  if (query && matches.length && !filteredMatches.length) resultCaption.textContent = "이 난이도에 맞는 책이 없어요. 난이도 필터를 바꿔보세요.";
  else if (query && matches.length) resultCaption.textContent = activeSearchMode === "project" ? `‘${query}’ 수행평가 주제와 책 제목·소개 키워드를 비교했어요.` : `‘${query}’ 관심사와 책 제목·소개 키워드를 비교했어요.`;
  else if (query && isDemo) resultCaption.textContent = `예시 책 목록에서 ‘${query}’와 가까운 책을 찾아봤어요.`;
  else if (query) resultCaption.textContent = activeSearchMode === "project" ? "주제와 일치하는 책이 없어 전체 대출 순위에서 보여드려요." : "검색어와 일치하는 책이 없어 전체 대출 순위에서 보여드려요.";
  else resultCaption.textContent = isDemo ? "예시 도서로 미리 둘러보고, CSV를 올려 실제 공공데이터를 분석해 보세요." : `${books.length.toLocaleString()}개 데이터 레코드에서 같은 제목은 묶어 추천해요.`;
  renderAnalysisReport(query, difficultyFilter === "all" || !filteredMatches.length ? matches : filteredMatches, ranked);
  renderBalancedBundle(query, filteredMatches);
  renderInsights(ranked);
  renderHistoryRecommendations(ranked);
}

showMoreButton.addEventListener("click", () => {
  visibleBookCount += 12;
  renderBooks(activeQuery, true);
});

function handleBookGridClick(event) {
  const button = event.target.closest("[data-book-rating]");
  if (button) {
    readingRatings[button.dataset.bookKey] = Number(button.dataset.bookRating);
    try { localStorage.setItem(ratingStorageKey, JSON.stringify(readingRatings)); } catch { /* Keep the rating for this page session. */ }
    renderBooks(activeQuery, true);
    return;
  }
  const detailTarget = event.target.closest("[data-open-book-key]") || event.target.closest(".book-card");
  if (detailTarget) renderBookDetail(detailTarget.dataset.openBookKey);
}

grid.addEventListener("click", handleBookGridClick);
best3Grid?.addEventListener("click", handleBookGridClick);

document.addEventListener("click", (event) => {
  if (event.target.closest("#detail-back")) {
    showView("discover");
    renderBooks(activeQuery, true);
    document.querySelector(".recommend-section").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const inquiryOption = event.target.closest("[data-inquiry-index]");
  if (inquiryOption) {
    selectedInquiryIndex = Number(inquiryOption.dataset.inquiryIndex);
    bookDetailContent.querySelectorAll("[data-inquiry-index]").forEach((option) => {
      const selected = Number(option.dataset.inquiryIndex) === selectedInquiryIndex;
      option.classList.toggle("selected", selected);
      option.setAttribute("aria-pressed", String(selected));
    });
    bookDetailContent.querySelector("#inquiry-choice-status").textContent = "선택한 질문을 수행평가 입력 화면의 탐구 방향으로 가져올 수 있어요.";
    bookDetailContent.querySelector("#apply-inquiry-question").disabled = false;
    return;
  }
  if (event.target.closest("#apply-inquiry-question")) {
    if (selectedInquiryIndex < 0 || !currentInquiryQuestions[selectedInquiryIndex]) return;
    const selectedBook = currentRankedBooks.find((book) => titleKey(book.title) === selectedBookKey);
    projectSubjectInput.value = activeProjectContext?.subject || projectSubjectInput.value;
    projectTopicInput.value = activeProjectContext?.topic || activeQuery || categoryKey(selectedBook || {}) || selectedBook?.title || "";
    projectDirectionInput.value = currentInquiryQuestions[selectedInquiryIndex];
    showView("project");
    projectDirectionInput.focus();
    return;
  }
  const button = event.target.closest("#book-detail-content [data-task-feedback]");
  if (!button || !selectedBookKey) return;
  taskUsefulness[selectedBookKey] = button.dataset.taskFeedback;
  try { localStorage.setItem(taskUsefulnessStorageKey, JSON.stringify(taskUsefulness)); } catch { /* Keep the evaluation for this page session. */ }
  renderBookDetail(selectedBookKey, false);
});

readingInsights.addEventListener("click", (event) => {
  const button = event.target.closest("[data-discover-topic]");
  if (!button) return;
  showView("discover");
  activeSearchMode = "interest";
  activeProjectContext = null;
  interestInput.value = button.dataset.discoverTopic;
  recordSearch(interestInput.value);
  renderBooks(interestInput.value);
  document.querySelector(".recommend-section").scrollIntoView({ behavior: "smooth", block: "start" });
});

historyRecommendations.addEventListener("click", (event) => {
  const button = event.target.closest("[data-history-topic]");
  if (!button) return;
  const topic = button.dataset.historyTopic;
  showView("discover");
  activeSearchMode = "interest";
  activeProjectContext = null;
  interestInput.value = topic;
  recordSearch(topic);
  renderBooks(topic);
  document.querySelector(".recommend-section").scrollIntoView({ behavior: "smooth", block: "start" });
});

clearSearchHistoryButton.addEventListener("click", () => {
  searchHistory = [];
  try { localStorage.removeItem(searchHistoryStorageKey); } catch { /* Clear the in-memory history. */ }
  renderHistoryRecommendations(rankBooks(""));
});

document.querySelectorAll("[data-project-topic]").forEach((button) => {
  button.addEventListener("click", () => {
    projectTopicInput.value = button.dataset.projectTopic;
    projectTopicInput.focus();
  });
});
projectSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const subject = projectSubjectInput.value.trim();
  const topic = projectTopicInput.value.trim();
  const direction = projectDirectionInput.value.trim();
  if (!topic) return;
  activeProjectContext = { subject, topic, direction };
  activeSearchMode = "project";
  recordSearch([subject, topic, direction].filter(Boolean).join(" "), topic);
  showView("discover");
  document.querySelectorAll(".topic-chip").forEach((chip) => chip.classList.remove("selected"));
  renderBooks(topic);
  document.querySelector(".recommend-section").scrollIntoView({ behavior: "smooth", block: "start" });
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  activeSearchMode = "interest";
  activeProjectContext = null;
  document.querySelectorAll(".topic-chip").forEach((chip) => chip.classList.remove("selected"));
  const query = interestInput.value.trim();
  recordSearch(query);
  renderBooks(query);
  document.querySelector(".recommend-section").scrollIntoView({ behavior: "smooth", block: "start" });
});

difficultyFilterSelect.addEventListener("change", () => {
  difficultyFilter = difficultyFilterSelect.value;
  renderBooks(activeQuery);
});

document.querySelectorAll(".topic-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    activeSearchMode = "interest";
    activeProjectContext = null;
    interestInput.value = chip.dataset.topic;
    recordSearch(chip.dataset.topic);
    document.querySelectorAll(".topic-chip").forEach((item) => item.classList.toggle("selected", item === chip));
    renderBooks(chip.dataset.topic);
    document.querySelector(".recommend-section").scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

fileInput.addEventListener("change", () => readCSV(fileInput.files[0]));
rubricFileInput.addEventListener("change", () => loadRubricFile(rubricFileInput.files[0]));
rubricPreview.addEventListener("click", (event) => {
  if (event.target.closest("#clear-rubric")) {
    activeRubric = [];
    activeRubricFilename = "";
    rubricFileInput.value = "";
    rubricFileName.textContent = "선택된 파일 없음";
    rubricPreview.innerHTML = "";
    rubricPreview.hidden = true;
    rubricError.hidden = true;
    return;
  }
  if (!event.target.closest("#apply-rubric-edits")) return;
  const corrected = [...rubricPreview.querySelectorAll(".rubric-edit-row")].map((row) => {
    const label = row.querySelector("[data-rubric-label]").value.trim();
    const pointText = row.querySelector("[data-rubric-points]").value.trim();
    return { label, points: Number(pointText) || 1, unweighted: !pointText };
  }).filter((criterion) => criterion.label && criterion.points > 0);
  if (!corrected.length) {
    rubricError.textContent = "항목 이름과 0보다 큰 배점을 하나 이상 입력해 주세요.";
    rubricError.hidden = false;
    return;
  }
  const total = corrected.reduce((sum, criterion) => sum + criterion.points, 0);
  activeRubric = corrected.map((criterion) => ({ ...criterion, weight: criterion.points / total }));
  rubricError.hidden = true;
  renderRubricPreview();
  rubricFileName.textContent = `${activeRubricFilename} · 기준 수정됨`;
});
document.querySelector("#apply-column-mapping").addEventListener("click", () => {
  if (pendingCSV) applyCSV(pendingCSV.rows, pendingCSV.headers, Number(titleColumn.value), pendingCSV.filename);
});
dropZone.addEventListener("dragover", (event) => { event.preventDefault(); dropZone.classList.add("dragover"); });
dropZone.addEventListener("dragleave", (event) => {
  if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove("dragover");
});
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragover");
  readCSV(event.dataTransfer.files[0]);
});

async function loadBundledData() {
  renderBooks();
  const sources = [
    { filename: "BestLoanList_20261031091317.csv", append: false },
    { filename: "GunpoRecommendedBooks_20251031.csv", append: true },
    { filename: "large_real_books_dataset.csv", append: true },
    { filename: "LibrarianRecommendedBooks_20250926.csv", append: true },
    { filename: "StudentProjectPicks_200_2.csv", append: true },
    { filename: "StudentProjectPicks_300_1.csv", append: true },
    { filename: "StudentProjectPicks_300_3.csv", append: true },
  ];
  let loadedCount = 0;
  try {
    for (const source of sources) {
      const response = await fetch(`./${source.filename}`);
      if (!response.ok) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (loadCSVText(decodeCSVBytes(bytes), source.filename, source.append)) loadedCount += 1;
    }
    if (!loadedCount) throw new Error("내장 CSV를 찾을 수 없습니다.");
    uploadTitle.textContent = `기본 데이터 ${loadedCount}종 연결 완료`;
    uploadDescription.textContent = "국립중앙도서관·군포시·사서 추천과 수행평가 활용 자료를 기본 적용했어요.";
    datasetMeta.textContent = `학생 활용 데이터 ${books.length.toLocaleString()}건 · 고유 제목 ${rankBooks("").length.toLocaleString()}개 · 기본 CSV ${loadedCount}종`;
    document.querySelector("#data-status").textContent = `기본 CSV ${loadedCount}종 연결 완료`;
  } catch {
    uploadTitle.textContent = "기본 데이터를 불러오지 못했어요";
    uploadDescription.textContent = "아래 버튼으로 도서 CSV 파일을 직접 선택해 주세요.";
  }
}

loadBundledData();
