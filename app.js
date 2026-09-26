const DB_NAME = 'meal-record-db';
const DB_VERSION = 1;
const STORE_NAME = 'meals';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const recordView = $('#recordView');
const historyView = $('#historyView');
const mealDate = $('#mealDate');
const historyDate = $('#historyDate');
const photoPreview = $('#photoPreview');
const photoPlaceholder = $('#photoPlaceholder');
const cameraInput = $('#cameraInput');
const libraryInput = $('#libraryInput');
const ingredients = $('#ingredients');
const saveButton = $('#saveButton');
const formMessage = $('#formMessage');
const mealList = $('#mealList');
const emptyState = $('#emptyState');
const historyHeading = $('#historyHeading');
const dateStrip = $('#dateStrip');
const mealCardTemplate = $('#mealCardTemplate');

let selectedImageBlob = null;
let currentPreviewUrl = null;
let dbPromise = null;

function today() {
  const now = new Date();
  return formatDateInput(now);
}

function formatDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseLocalDate(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatJapaneseDate(dateString) {
  const date = parseLocalDate(dateString);
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
  }).format(date);
}

function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date);
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? request.transaction.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: 'id' });

      if (!store.indexNames.contains('date')) {
        store.createIndex('date', 'date', { unique: false });
      }
      if (!store.indexNames.contains('createdAt')) {
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function addMeal(meal) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(meal);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getMealsByDate(date) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('date');
    const request = index.getAll(IDBKeyRange.only(date));
    request.onsuccess = () => {
      const meals = request.result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      resolve(meals);
    };
    request.onerror = () => reject(request.error);
  });
}

async function fileToCompressedBlob(file, maxDimension = 1280, quality = 0.82) {
  if (!file.type.startsWith('image/')) throw new Error('画像ファイルを選択してください。');

  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('画像の処理に失敗しました。'));
      resolve(blob);
    }, 'image/jpeg', quality);
  });
}

function setPreview(blob) {
  if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
  currentPreviewUrl = URL.createObjectURL(blob);
  photoPreview.src = currentPreviewUrl;
  photoPreview.hidden = false;
  photoPlaceholder.hidden = true;
}

async function handleSelectedFile(file) {
  if (!file) return;
  setMessage('画像を読み込んでいます…');
  try {
    selectedImageBlob = await fileToCompressedBlob(file);
    setPreview(selectedImageBlob);
    setMessage('');
  } catch (error) {
    console.error(error);
    setMessage(error.message || '画像の読み込みに失敗しました。', 'error');
  }
}

function setMessage(message, type = '') {
  formMessage.textContent = message;
  formMessage.className = 'form-message';
  if (type) formMessage.classList.add(type);
}

function resetRecordForm() {
  mealDate.value = today();
  ingredients.value = '';
  selectedImageBlob = null;
  if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
  currentPreviewUrl = null;
  photoPreview.hidden = true;
  photoPreview.removeAttribute('src');
  photoPlaceholder.hidden = false;
  cameraInput.value = '';
  libraryInput.value = '';
}

async function saveMeal() {
  if (!mealDate.value) {
    setMessage('日付を選択してください。', 'error');
    return;
  }
  if (!selectedImageBlob) {
    setMessage('食事の写真を登録してください。', 'error');
    return;
  }

  saveButton.disabled = true;
  setMessage('保存しています…');
  const now = new Date();
  const meal = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    date: mealDate.value,
    time: formatTime(now),
    image: selectedImageBlob,
    ingredients: ingredients.value.trim(),
    createdAt: now.toISOString()
  };

  try {
    await addMeal(meal);
    resetRecordForm();
    setMessage('登録しました。', 'success');
  } catch (error) {
    console.error(error);
    setMessage('保存に失敗しました。端末の空き容量をご確認ください。', 'error');
  } finally {
    saveButton.disabled = false;
  }
}

function switchView(viewName) {
  const showHistory = viewName === 'history';
  recordView.classList.toggle('active', !showHistory);
  historyView.classList.toggle('active', showHistory);
  $$('.nav-item').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === viewName));
  if (showHistory) renderHistory(historyDate.value || today());
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function renderDateStrip(centerDateString) {
  dateStrip.innerHTML = '';
  const center = parseLocalDate(centerDateString);
  const weekdayFormatter = new Intl.DateTimeFormat('ja-JP', { weekday: 'short' });

  for (let offset = -2; offset <= 2; offset += 1) {
    const date = new Date(center);
    date.setDate(center.getDate() + offset);
    const value = formatDateInput(date);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `date-chip${value === centerDateString ? ' active' : ''}`;
    button.innerHTML = `${weekdayFormatter.format(date)}<strong>${date.getDate()}</strong>`;
    button.addEventListener('click', () => {
      historyDate.value = value;
      renderHistory(value);
    });
    dateStrip.appendChild(button);
  }
}

async function renderHistory(dateString) {
  if (!dateString) dateString = today();
  historyDate.value = dateString;
  historyHeading.textContent = formatJapaneseDate(dateString);
  renderDateStrip(dateString);
  mealList.innerHTML = '';
  emptyState.hidden = true;

  try {
    const meals = await getMealsByDate(dateString);
    if (!meals.length) {
      emptyState.hidden = false;
      return;
    }

    for (const meal of meals) {
      const node = mealCardTemplate.content.cloneNode(true);
      const image = node.querySelector('.meal-image');
      const time = node.querySelector('.meal-time');
      const ing = node.querySelector('.meal-ingredients');
      const objectUrl = URL.createObjectURL(meal.image);
      image.src = objectUrl;
      image.addEventListener('load', () => URL.revokeObjectURL(objectUrl), { once: true });
      time.textContent = meal.time || '--:--';
      ing.textContent = meal.ingredients || '';
      mealList.appendChild(node);
    }
  } catch (error) {
    console.error(error);
    emptyState.hidden = false;
    emptyState.querySelector('p').textContent = '記録の読み込みに失敗しました';
  }
}

function shiftHistoryDate(days) {
  const base = parseLocalDate(historyDate.value || today());
  base.setDate(base.getDate() + days);
  const value = formatDateInput(base);
  historyDate.value = value;
  renderHistory(value);
}

function installEvents() {
  $('#cameraButton').addEventListener('click', () => cameraInput.click());
  $('#libraryButton').addEventListener('click', () => libraryInput.click());
  cameraInput.addEventListener('change', (event) => handleSelectedFile(event.target.files?.[0]));
  libraryInput.addEventListener('change', (event) => handleSelectedFile(event.target.files?.[0]));
  saveButton.addEventListener('click', saveMeal);
  historyDate.addEventListener('change', () => renderHistory(historyDate.value));
  $('#prevDay').addEventListener('click', () => shiftHistoryDate(-1));
  $('#nextDay').addEventListener('click', () => shiftHistoryDate(1));
  $$('.nav-item').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
}

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./service-worker.js');
    } catch (error) {
      console.warn('Service Worker registration failed:', error);
    }
  }
}

async function init() {
  mealDate.value = today();
  historyDate.value = today();
  installEvents();
  await openDb();
  await registerServiceWorker();
}

document.addEventListener('DOMContentLoaded', init);
