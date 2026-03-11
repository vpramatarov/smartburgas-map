// Source of truth for the locales

export const bg = {
    // --- Languages ---
    bg: 'БГ',
    en: 'АНГЛ',

    // --- Regions ---
    regions: 'Региони',

    // --- Bulk Controls ---
    select_all: 'Избери всички',
    deselect_all: 'Отмаркирай всички',

    // --- Sidebar Layer Names ---
    layer_smart_parking: 'Смарт Паркинги',
    layer_air_quality: 'Качество на въздуха',
    layer_traffic: 'Трафик камери',
    layer_mobile_waste: 'Мобилни центрове за отпадъци',
    layer_bikes: 'Велосипеди под наем',
    layer_camera: 'Камери',
    layer_billing_machines: 'Паркомати',
    layer_ev_charging: 'Зареждане на ел. превозни средства',
    layer_taxi_stands: 'Стоянки на таксита',

    // --- Map Popups & Tooltips ---
    click_for_details: 'Кликнете за детайли',
    loading: 'Зареждане...',
    error_loading_data: 'Грешка при зареждане на данните',

    // --- Sensor Data Cards ---
    capacity: 'Капацитет',
    free: 'Свободни',
    free_spots: 'Свободни места',
    free_spots_history: 'История на свободните места',
    last_updated: 'Последно обновяване:',
    status: 'Статус:',
    total: 'общо',
    occupied: 'заети',

    // --- Status Values ---
    status_active: 'Активен',
    status_inactive: 'Неактивен',
    status_unknown: 'Неизвестен',

    // --- Chart Labels ---
    chart: 'Диаграма',
    time: 'Време',
    spots: 'Места',

    // --- Traffic ---
    car_count: 'Брой коли',
    car_speed: 'Средна скорост на колите',
    km_h: 'км/ч',
    speed: 'Скорост',
    cars: 'коли',

    // --- Validation ---
    invalid_date_format: 'Невалиден формат на датата.',
    min_date_range: 'Диапазонът от дати трябва да бъде поне 2 дни.',
    max_date_range: 'Периодът от дати не може да надвишава 6 месеца.',
    start_date_after_end_date: 'Началната дата не може да бъде след крайната дата.',

    // --- CSV Export ---
    feature_id_or_name: 'Ид или Име на свойството',
    data_type: 'Тип данни',
    variable: 'Променлива',
    date: 'Дата',
    timestamp: 'Времева марка',
    value: 'Стойност',
    unit: 'Единица',
    no_pinned_sensors_for_export: 'Моля, закачете поне един сензор за експортиране на данни.',
    from_date: 'От',
    to_date: 'До',

    // --- Paid Parking Zones ---
    layer_paid_parking_zones: 'Платени зони за паркиране',
    click_to_filter: 'Кликнете за филтриране',
    price_per_hour: 'Цена на час',
    working_hours: 'Работно време',
    sms_number: 'SMS номер',
    bgn: 'лв.',

    // --- Misc ---
    filters: 'Филтри',
    no_chart_data: 'Няма данни за диаграма.',
    download_csv: 'Свали като CSV',
    full_screen_chart: 'Диаграма на цял екран',
    combined_analysis: 'Комбиниран анализ',
    unknown_sensor: 'Неизвестен сензор',
    click_to_pin: 'Кликнете, за да закачите',
    no_sensors_pinned: 'Няма закрепени сензори',
    click_map_marker_to_add: 'Кликнете върху маркер на картата, за да добавите',
    pin_location: 'Закачи локацията',
    unpin_location: 'Откачи локацията',
    no_data: 'Няма данни',
    kg: 'кг',
    updated: 'Актуализирано'
};

// use type inference
export type TranslationKeys = typeof bg;