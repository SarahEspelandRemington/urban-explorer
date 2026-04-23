export type LocaleCode =
  | "en"
  | "es"
  | "fr"
  | "de"
  | "it"
  | "pt"
  | "nl"
  | "ja"
  | "ko"
  | "zh";

export interface LocaleMeta {
  code: LocaleCode;
  label: string;
  notificationTitle: string;
  notificationBody: string;
}

export interface Strings {
  notificationTitle: string;
  notificationBody: string;
  common: {
    retry: string;
    ok: string;
    close: string;
    or: string;
    somethingWrong: string;
  };
  tabs: { explore: string; saved: string };
  explore: {
    discover: string;
    readyToExplore: string;
    locating: string;
    improvingGps: string;
    range: string;
    rangeClose: string;
    rangeMedium: string;
    rangeWide: string;
    all: string;
    driftBanner: string;
    startWalking: string;
    audioTourSubtitle: string;
    investigateTitle: string;
    investigateSubtitle: string;
    ratingPaceWarning: string;
    busyTitle: string;
    busyDetail: string;
    errorTitle: string;
    errorDetail: string;
    nothingFoundTitle: string;
    nothingFoundDetail: string;
    tryRange: (r: number) => string;
    searchAgain: string;
    startExploringTitle: string;
    startExploringDetail: string;
    locationNotFound: string;
    locationServiceBusy: string;
  };
  saved: {
    title: string;
    placeOne: string;
    placeMany: string;
    emptyTitle: string;
    emptyDetail: string;
  };
  walkMode: {
    end: string;
    walking: string;
    sparse: string;
    dense: string;
    gettingLocation: string;
    nowPlaying: string;
    listening: string;
    keepWalking: string;
    storiesOften: string;
    storiesAsYouGo: string;
    storiesSoFar: (n: number) => string;
  };
  walkPlan: {
    title: string;
    subtitle: string;
    startPlaceholder: string;
    endPlaceholder: string;
    findRoute: string;
    startWalk: string;
    searching: string;
    fetchingStops: string;
    stopsFound: (n: number) => string;
    noRoute: string;
    routeError: string;
    geocodeError: string;
    previewLabel: string;
    emptyRouteNote: string;
  };
  placeDetail: {
    quickFacts: string;
    history: string;
    architecture: string;
    notableEvents: string;
    moreFunFacts: string;
    nearbyRelated: string;
    couldNotLoad: string;
  };
  locationPermission: {
    titleSearch: string;
    titleEnable: string;
    descriptionSearch: string;
    descriptionEnable: string;
    placeholder: string;
    finding: string;
    exploreThis: string;
    backToResults: string;
    useCurrentInstead: string;
    openSettings: string;
    deniedWeb: string;
    allow: string;
    searchByLocation: string;
    startWalking: string;
    walkSubtext: string;
  };
  languageModal: {
    title: string;
    subtitle: string;
    preview: string;
  };
  placeCard: {
    topPick: string;
    walkLessThan: string;
    walkMin: (n: number) => string;
    walkFt: (n: number) => string;
    walkMi: (s: string) => string;
    rateLimitTitle: string;
    rateLimitBody: string;
    saveErrTitle: string;
    saveErrBody: string;
  };
  placeActions: {
    playing: string;
    tellMore: string;
    headThere: string;
    headingThere: string;
  };
  placeTimeline: {
    title: string;
    subtitle: string;
    loading: string;
    error: string;
  };
  loadingMessages: {
    discovery: string[];
    detail: string[];
  };
  investigate: {
    headerTitle: string;
    headerSubtitle: string;
    placeholder: string;
    investigate: string;
    hint: string;
    notFoundError: string;
    busyError: string;
    genericError: string;
    originallyPrefix: string;
    sectionOriginally: string;
    sectionToday: string;
    sectionWhatToLookFor: string;
    sectionHistory: string;
    sectionFacts: string;
    sectionBlockContext: string;
  };
  login: {
    title: string;
    subtitle: string;
    cta: string;
  };
  notFound: {
    stackTitle: string;
    title: string;
    link: string;
  };
}

const en: Strings = {
  notificationTitle: "Urban Explorer is exploring with you",
  notificationBody: "Listening for nearby places to narrate as you walk.",
  common: {
    retry: "Retry",
    ok: "OK",
    close: "Close",
    or: "or",
    somethingWrong: "Something went wrong. Please try again.",
  },
  tabs: { explore: "Explore", saved: "Saved" },
  explore: {
    discover: "Discover",
    readyToExplore: "Ready to explore",
    locating: "Locating…",
    improvingGps: "Improving GPS accuracy…",
    range: "Range",
    rangeClose: "Close",
    rangeMedium: "Medium",
    rangeWide: "Wide",
    all: "All",
    driftBanner: "You've moved — tap to refresh this area",
    startWalking: "Start Walking",
    audioTourSubtitle: "Audio tour guide — headphones or speaker",
    investigateTitle: "Investigate an Address",
    investigateSubtitle: "Curious about a specific building? Look it up.",
    ratingPaceWarning: "You're rating quickly — pace yourself",
    busyTitle: "We're a bit busy",
    busyDetail: "We're busy right now — try again in a moment.",
    errorTitle: "Something went wrong",
    errorDetail: "We couldn't find places nearby. Try again.",
    nothingFoundTitle: "Nothing found nearby",
    nothingFoundDetail:
      "No stories found within this range. Try a wider range or move a little further down the block.",
    tryRange: (r) => `Try ${r}m range`,
    searchAgain: "Search again",
    startExploringTitle: "Start Exploring",
    startExploringDetail: "Tap the compass to discover interesting places around you",
    locationNotFound: "Couldn't find that location. Try being more specific.",
    locationServiceBusy: "Location service is temporarily unavailable — try again in a moment.",
  },
  saved: {
    title: "Saved",
    placeOne: "place",
    placeMany: "places",
    emptyTitle: "No saved places yet",
    emptyDetail: "Bookmark places you discover to revisit them later",
  },
  walkMode: {
    end: "End",
    walking: "Walking",
    sparse: "Sparse",
    dense: "Dense",
    gettingLocation: "Getting your location…",
    nowPlaying: "Now playing",
    listening: "Listening for stories nearby…",
    keepWalking: "Keep walking",
    storiesOften: "Stories will play often",
    storiesAsYouGo: "Stories will play as you go",
    storiesSoFar: (n) => `${n} ${n === 1 ? "story" : "stories"} so far`,
  },
  walkPlan: {
    title: "Plan a Walk",
    subtitle: "Enter start and end to pre-load stories along your route",
    startPlaceholder: "Starting point",
    endPlaceholder: "Destination",
    findRoute: "Find Route",
    startWalk: "Start Walk",
    searching: "Finding route…",
    fetchingStops: "Loading stories along route…",
    stopsFound: (n) => `${n} ${n === 1 ? "stop" : "stops"} loaded`,
    noRoute: "No walking route found between those points.",
    routeError: "Couldn't find a route. Check your addresses and try again.",
    geocodeError: "Couldn't locate that address. Try being more specific.",
    previewLabel: "Along your route",
    emptyRouteNote: "No stops were pre-loaded — GPS discovery will find stories as you walk.",
  },
  placeDetail: {
    quickFacts: "Quick Facts",
    history: "History",
    architecture: "Architecture",
    notableEvents: "Notable Events",
    moreFunFacts: "More Fun Facts",
    nearbyRelated: "Nearby Related",
    couldNotLoad: "Could not load detailed history. Check your connection and try again.",
  },
  locationPermission: {
    titleSearch: "Search a Location",
    titleEnable: "Enable Location",
    descriptionSearch: "Enter a city, neighborhood, intersection, or address to explore.",
    descriptionEnable:
      "Urban Explorer needs your location to discover interesting buildings and historical sites near you.",
    placeholder: "e.g. Greenwich Village, NYC",
    finding: "Finding location...",
    exploreThis: "Explore This Location",
    backToResults: "Back to results",
    useCurrentInstead: "Use my current location instead",
    openSettings: "Open Settings",
    deniedWeb:
      "Location access was denied. Please enable it in your browser settings, or search for a location below.",
    allow: "Allow Location Access",
    searchByLocation: "Search by Location",
    startWalking: "Start Walking",
    walkSubtext: "Skip ahead — explore on foot with audio",
  },
  languageModal: {
    title: "App language",
    subtitle:
      "Used throughout the app and for the background notification shown while you walk. Walk notification updates on your next walk.",
    preview: "Preview",
  },
  placeCard: {
    topPick: "Top pick",
    walkLessThan: "< 1 min",
    walkMin: (n) => `${n} min`,
    walkFt: (n) => `${n} ft`,
    walkMi: (s) => `${s} mi`,
    rateLimitTitle: "Slow down a bit",
    rateLimitBody: "You've rated a lot of places recently — try again in a few minutes.",
    saveErrTitle: "Couldn't save your rating",
    saveErrBody: "Something went wrong — check your connection and try again.",
  },
  placeActions: {
    playing: "Playing",
    tellMore: "Tell me more",
    headThere: "Head There",
    headingThere: "Heading there",
  },
  placeTimeline: {
    title: "Time Travel",
    subtitle: "See how this place evolved through history",
    loading: "Traveling through time...",
    error: "Could not load timeline. Check your connection and try again.",
  },
  loadingMessages: {
    discovery: [
      "Digging through the archives...",
      "Checking old maps and records...",
      "Unearthing local secrets...",
      "What's hiding in plain sight here...",
      "Your personal time machine is warming up...",
      "Building your personal history guide...",
      "Every spot has a story — finding yours now...",
      "Crafting discoveries just for this spot — hang tight...",
    ],
    detail: [
      "Digging deeper into the archives...",
      "Uncovering the full story...",
      "Piecing together forgotten chapters...",
      "Crafting a history just for this place...",
    ],
  },
  investigate: {
    headerTitle: "Investigate an Address",
    headerSubtitle: "Curious about a specific building? Ask the historian.",
    placeholder: "e.g., 538 W 38th St, New York, NY",
    investigate: "Investigate",
    hint:
      "Best for older or non-landmark buildings you've noticed in person — the AI will reason from the architecture and neighborhood when records are sparse.",
    notFoundError:
      "Couldn't find that address. Try including a city or zip (e.g., '538 W 38th St, New York, NY').",
    busyError: "We're a bit busy — give it a moment and try again.",
    genericError: "Something went wrong. Try again in a moment.",
    originallyPrefix: "Originally:",
    sectionOriginally: "Originally",
    sectionToday: "Today",
    sectionWhatToLookFor: "What to look for",
    sectionHistory: "History",
    sectionFacts: "Facts & details",
    sectionBlockContext: "Block context",
  },
  login: {
    title: "Urban Explorer",
    subtitle:
      "Discover the hidden history around you. Log in or create a free account to start exploring.",
    cta: "Log in / Sign up",
  },
  notFound: {
    stackTitle: "Oops!",
    title: "This screen doesn't exist.",
    link: "Go to home screen!",
  },
};

const es: Strings = {
  notificationTitle: "Urban Explorer está explorando contigo",
  notificationBody: "Escuchando lugares cercanos para narrar mientras caminas.",
  common: {
    retry: "Reintentar",
    ok: "OK",
    close: "Cerrar",
    or: "o",
    somethingWrong: "Algo salió mal. Inténtalo de nuevo.",
  },
  tabs: { explore: "Explorar", saved: "Guardados" },
  explore: {
    discover: "Descubrir",
    readyToExplore: "Listo para explorar",
    locating: "Ubicando…",
    improvingGps: "Mejorando la precisión del GPS…",
    range: "Alcance",
    rangeClose: "Cerca",
    rangeMedium: "Medio",
    rangeWide: "Amplio",
    all: "Todo",
    driftBanner: "Te has movido — toca para actualizar esta zona",
    startWalking: "Empezar a caminar",
    audioTourSubtitle: "Audioguía — auriculares o altavoz",
    investigateTitle: "Investigar una dirección",
    investigateSubtitle: "¿Curioso por un edificio en particular? Búscalo.",
    ratingPaceWarning: "Estás valorando muy rápido — tómate un respiro",
    busyTitle: "Estamos un poco ocupados",
    busyDetail: "Hay mucha actividad ahora — vuelve a intentarlo en un momento.",
    errorTitle: "Algo salió mal",
    errorDetail: "No pudimos encontrar lugares cerca. Inténtalo de nuevo.",
    nothingFoundTitle: "Nada encontrado por aquí",
    nothingFoundDetail:
      "No hay historias en este rango. Prueba un rango mayor o avanza un poco más por la calle.",
    tryRange: (r) => `Probar rango de ${r} m`,
    searchAgain: "Buscar otra vez",
    startExploringTitle: "Empieza a explorar",
    startExploringDetail: "Toca la brújula para descubrir lugares interesantes cerca de ti",
    locationNotFound: "No encontramos esa ubicación. Intenta ser más específico.",
    locationServiceBusy:
      "El servicio de ubicación no está disponible — inténtalo de nuevo en un momento.",
  },
  saved: {
    title: "Guardados",
    placeOne: "lugar",
    placeMany: "lugares",
    emptyTitle: "Aún no hay lugares guardados",
    emptyDetail: "Guarda lugares que descubras para volver a ellos después",
  },
  walkMode: {
    end: "Fin",
    walking: "Caminando",
    sparse: "Pocas",
    dense: "Frecuentes",
    gettingLocation: "Obteniendo tu ubicación…",
    nowPlaying: "Reproduciendo",
    listening: "Buscando historias cercanas…",
    keepWalking: "Sigue caminando",
    storiesOften: "Las historias sonarán con frecuencia",
    storiesAsYouGo: "Las historias sonarán mientras avanzas",
    storiesSoFar: (n) => `${n} ${n === 1 ? "historia" : "historias"} hasta ahora`,
  },
  walkPlan: {
    title: "Planificar un paseo",
    subtitle: "Ingresa inicio y destino para precargar historias en tu ruta",
    startPlaceholder: "Punto de partida",
    endPlaceholder: "Destino",
    findRoute: "Encontrar ruta",
    startWalk: "Iniciar paseo",
    searching: "Buscando ruta…",
    fetchingStops: "Cargando historias en la ruta…",
    stopsFound: (n) => `${n} ${n === 1 ? "parada" : "paradas"} cargadas`,
    noRoute: "No se encontró una ruta a pie entre esos puntos.",
    routeError: "No se pudo encontrar la ruta. Verifica las direcciones.",
    geocodeError: "No se pudo localizar esa dirección. Sé más específico.",
    previewLabel: "A lo largo de tu ruta",
    emptyRouteNote: "No se precargaron paradas — el GPS encontrará historias mientras caminas.",
  },
  placeDetail: {
    quickFacts: "Datos rápidos",
    history: "Historia",
    architecture: "Arquitectura",
    notableEvents: "Eventos destacados",
    moreFunFacts: "Más curiosidades",
    nearbyRelated: "Relacionados cerca",
    couldNotLoad: "No pudimos cargar la historia. Revisa tu conexión e inténtalo de nuevo.",
  },
  locationPermission: {
    titleSearch: "Buscar una ubicación",
    titleEnable: "Activar ubicación",
    descriptionSearch:
      "Introduce una ciudad, barrio, intersección o dirección para explorar.",
    descriptionEnable:
      "Urban Explorer necesita tu ubicación para descubrir edificios y sitios históricos interesantes cerca de ti.",
    placeholder: "p. ej. Greenwich Village, NYC",
    finding: "Buscando ubicación...",
    exploreThis: "Explorar esta ubicación",
    backToResults: "Volver a los resultados",
    useCurrentInstead: "Usar mi ubicación actual",
    openSettings: "Abrir ajustes",
    deniedWeb:
      "Se denegó el acceso a la ubicación. Actívalo en los ajustes del navegador o busca una ubicación abajo.",
    allow: "Permitir ubicación",
    searchByLocation: "Buscar por ubicación",
    startWalking: "Empezar a caminar",
    walkSubtext: "Sáltate este paso — explora a pie con audio",
  },
  languageModal: {
    title: "Idioma de la app",
    subtitle:
      "Usado en toda la app y en la notificación que aparece mientras caminas. La notificación se actualiza en tu próxima caminata.",
    preview: "Vista previa",
  },
  placeCard: {
    topPick: "Top pick",
    walkLessThan: "< 1 min",
    walkMin: (n) => `${n} min`,
    walkFt: (n) => `${n} ft`,
    walkMi: (s) => `${s} mi`,
    rateLimitTitle: "Tómalo con calma",
    rateLimitBody: "Has valorado muchos lugares — vuelve a intentarlo en unos minutos.",
    saveErrTitle: "No se pudo guardar tu valoración",
    saveErrBody: "Algo salió mal — revisa tu conexión e inténtalo de nuevo.",
  },
  placeActions: {
    playing: "Reproduciendo",
    tellMore: "Cuéntame más",
    headThere: "Ir hacia allá",
    headingThere: "Yendo hacia allá",
  },
  placeTimeline: {
    title: "Viaje en el tiempo",
    subtitle: "Mira cómo este lugar ha evolucionado a lo largo de la historia",
    loading: "Viajando en el tiempo...",
    error: "No se pudo cargar la cronología. Revisa tu conexión e inténtalo de nuevo.",
  },
  loadingMessages: {
    discovery: [
      "Buscando en los archivos...",
      "Revisando viejos mapas y registros...",
      "Desenterrando secretos locales...",
      "Lo que se esconde a la vista...",
      "Tu máquina del tiempo personal se calienta...",
      "Construyendo tu guía histórica personal...",
      "Cada lugar tiene una historia — buscando la tuya...",
      "Creando descubrimientos para este sitio — un momento...",
    ],
    detail: [
      "Profundizando en los archivos...",
      "Descubriendo la historia completa...",
      "Uniendo capítulos olvidados...",
      "Creando una historia para este lugar...",
    ],
  },
  investigate: {
    headerTitle: "Investigar una dirección",
    headerSubtitle: "¿Curioso por un edificio en particular? Pregunta al historiador.",
    placeholder: "p. ej., 538 W 38th St, New York, NY",
    investigate: "Investigar",
    hint:
      "Ideal para edificios antiguos o no famosos que hayas visto en persona — la IA razonará a partir de la arquitectura y el barrio cuando los registros sean escasos.",
    notFoundError:
      "No encontramos esa dirección. Intenta incluir una ciudad o código postal.",
    busyError: "Estamos un poco ocupados — espera un momento e inténtalo de nuevo.",
    genericError: "Algo salió mal. Inténtalo de nuevo en un momento.",
    originallyPrefix: "Originalmente:",
    sectionOriginally: "Originalmente",
    sectionToday: "Hoy",
    sectionWhatToLookFor: "Qué observar",
    sectionHistory: "Historia",
    sectionFacts: "Datos y detalles",
    sectionBlockContext: "Contexto del barrio",
  },
  login: {
    title: "Urban Explorer",
    subtitle:
      "Descubre la historia oculta a tu alrededor. Inicia sesión o crea una cuenta gratis para empezar.",
    cta: "Iniciar sesión / Registrarse",
  },
  notFound: {
    stackTitle: "¡Vaya!",
    title: "Esta pantalla no existe.",
    link: "¡Ir a la pantalla de inicio!",
  },
};

const fr: Strings = {
  notificationTitle: "Urban Explorer explore avec vous",
  notificationBody: "À l'écoute des lieux proches à raconter pendant votre marche.",
  common: {
    retry: "Réessayer",
    ok: "OK",
    close: "Fermer",
    or: "ou",
    somethingWrong: "Une erreur est survenue. Veuillez réessayer.",
  },
  tabs: { explore: "Explorer", saved: "Enregistrés" },
  explore: {
    discover: "Découvrir",
    readyToExplore: "Prêt à explorer",
    locating: "Localisation…",
    improvingGps: "Amélioration de la précision GPS…",
    range: "Rayon",
    rangeClose: "Proche",
    rangeMedium: "Moyen",
    rangeWide: "Large",
    all: "Tout",
    driftBanner: "Vous avez bougé — appuyez pour actualiser",
    startWalking: "Commencer la marche",
    audioTourSubtitle: "Guide audio — casque ou haut-parleur",
    investigateTitle: "Enquêter sur une adresse",
    investigateSubtitle: "Curieux d'un bâtiment précis ? Cherchez-le.",
    ratingPaceWarning: "Vous notez très vite — prenez votre temps",
    busyTitle: "Nous sommes occupés",
    busyDetail: "Beaucoup de monde en ce moment — réessayez dans un instant.",
    errorTitle: "Une erreur est survenue",
    errorDetail: "Aucun lieu trouvé près de vous. Réessayez.",
    nothingFoundTitle: "Rien trouvé à proximité",
    nothingFoundDetail:
      "Aucune histoire dans ce rayon. Essayez un rayon plus large ou avancez un peu.",
    tryRange: (r) => `Essayer un rayon de ${r} m`,
    searchAgain: "Rechercher à nouveau",
    startExploringTitle: "Commencez à explorer",
    startExploringDetail: "Touchez la boussole pour découvrir des lieux intéressants",
    locationNotFound: "Impossible de trouver ce lieu. Essayez d'être plus précis.",
    locationServiceBusy:
      "Service de localisation indisponible — réessayez dans un instant.",
  },
  saved: {
    title: "Enregistrés",
    placeOne: "lieu",
    placeMany: "lieux",
    emptyTitle: "Aucun lieu enregistré",
    emptyDetail: "Marquez les lieux que vous découvrez pour les retrouver plus tard",
  },
  walkMode: {
    end: "Fin",
    walking: "En marche",
    sparse: "Rares",
    dense: "Fréquentes",
    gettingLocation: "Obtention de votre position…",
    nowPlaying: "En lecture",
    listening: "Recherche d'histoires à proximité…",
    keepWalking: "Continuez à marcher",
    storiesOften: "Les histoires se déclencheront souvent",
    storiesAsYouGo: "Les histoires se déclencheront en chemin",
    storiesSoFar: (n) => `${n} ${n === 1 ? "histoire" : "histoires"} jusqu'ici`,
  },
  walkPlan: {
    title: "Planifier une balade",
    subtitle: "Entrez départ et destination pour charger les histoires à l'avance",
    startPlaceholder: "Point de départ",
    endPlaceholder: "Destination",
    findRoute: "Trouver l'itinéraire",
    startWalk: "Démarrer la balade",
    searching: "Recherche de l'itinéraire…",
    fetchingStops: "Chargement des histoires sur le parcours…",
    stopsFound: (n) => `${n} ${n === 1 ? "arrêt chargé" : "arrêts chargés"}`,
    noRoute: "Aucun itinéraire piéton trouvé entre ces points.",
    routeError: "Impossible de trouver un itinéraire. Vérifiez les adresses.",
    geocodeError: "Impossible de localiser cette adresse. Soyez plus précis.",
    previewLabel: "Sur votre parcours",
    emptyRouteNote: "Aucun arrêt pré-chargé — le GPS trouvera des histoires pendant votre marche.",
  },
  placeDetail: {
    quickFacts: "Faits rapides",
    history: "Histoire",
    architecture: "Architecture",
    notableEvents: "Événements marquants",
    moreFunFacts: "Plus d'anecdotes",
    nearbyRelated: "Liens à proximité",
    couldNotLoad: "Impossible de charger l'histoire. Vérifiez votre connexion et réessayez.",
  },
  locationPermission: {
    titleSearch: "Rechercher un lieu",
    titleEnable: "Activer la localisation",
    descriptionSearch: "Entrez une ville, un quartier, un croisement ou une adresse.",
    descriptionEnable:
      "Urban Explorer a besoin de votre position pour trouver des bâtiments intéressants et des sites historiques près de vous.",
    placeholder: "ex. Greenwich Village, NYC",
    finding: "Recherche du lieu...",
    exploreThis: "Explorer ce lieu",
    backToResults: "Retour aux résultats",
    useCurrentInstead: "Utiliser ma position actuelle",
    openSettings: "Ouvrir les réglages",
    deniedWeb:
      "L'accès à la position a été refusé. Activez-le dans les réglages du navigateur ou cherchez un lieu ci-dessous.",
    allow: "Autoriser la localisation",
    searchByLocation: "Rechercher un lieu",
    startWalking: "Commencer la marche",
    walkSubtext: "Passez l'étape — explorez à pied avec l'audio",
  },
  languageModal: {
    title: "Langue de l'application",
    subtitle:
      "Utilisée dans toute l'application et pour la notification affichée pendant la marche. La notification se met à jour à votre prochaine marche.",
    preview: "Aperçu",
  },
  placeCard: {
    topPick: "Coup de cœur",
    walkLessThan: "< 1 min",
    walkMin: (n) => `${n} min`,
    walkFt: (n) => `${n} ft`,
    walkMi: (s) => `${s} mi`,
    rateLimitTitle: "Doucement",
    rateLimitBody: "Vous avez noté beaucoup de lieux — réessayez dans quelques minutes.",
    saveErrTitle: "Impossible d'enregistrer votre note",
    saveErrBody: "Une erreur est survenue — vérifiez votre connexion et réessayez.",
  },
  placeActions: {
    playing: "Lecture",
    tellMore: "En savoir plus",
    headThere: "Y aller",
    headingThere: "En route",
  },
  placeTimeline: {
    title: "Voyage dans le temps",
    subtitle: "Voyez comment ce lieu a évolué à travers l'histoire",
    loading: "Voyage dans le temps...",
    error: "Impossible de charger la chronologie. Vérifiez votre connexion et réessayez.",
  },
  loadingMessages: {
    discovery: [
      "Fouille dans les archives...",
      "Vérification des vieilles cartes...",
      "On déterre les secrets locaux...",
      "Ce qui se cache à la vue de tous...",
      "Votre machine à voyager dans le temps chauffe...",
      "Construction de votre guide d'histoire...",
      "Chaque endroit a une histoire — on cherche la vôtre...",
      "Création de découvertes pour ce lieu — un instant...",
    ],
    detail: [
      "Fouille plus profonde dans les archives...",
      "Découverte de l'histoire complète...",
      "Reconstitution des chapitres oubliés...",
      "Création d'une histoire pour ce lieu...",
    ],
  },
  investigate: {
    headerTitle: "Enquêter sur une adresse",
    headerSubtitle: "Curieux d'un bâtiment précis ? Demandez à l'historien.",
    placeholder: "ex., 538 W 38th St, New York, NY",
    investigate: "Enquêter",
    hint:
      "Idéal pour les bâtiments anciens ou non emblématiques que vous avez remarqués — l'IA raisonne à partir de l'architecture et du quartier quand les archives sont rares.",
    notFoundError:
      "Adresse introuvable. Essayez d'inclure une ville ou un code postal.",
    busyError: "Nous sommes occupés — patientez un instant et réessayez.",
    genericError: "Une erreur est survenue. Réessayez dans un instant.",
    originallyPrefix: "À l'origine :",
    sectionOriginally: "À l'origine",
    sectionToday: "Aujourd'hui",
    sectionWhatToLookFor: "À observer",
    sectionHistory: "Histoire",
    sectionFacts: "Faits et détails",
    sectionBlockContext: "Contexte du quartier",
  },
  login: {
    title: "Urban Explorer",
    subtitle:
      "Découvrez l'histoire cachée autour de vous. Connectez-vous ou créez un compte gratuit pour commencer.",
    cta: "Se connecter / S'inscrire",
  },
  notFound: {
    stackTitle: "Oups !",
    title: "Cet écran n'existe pas.",
    link: "Retour à l'accueil !",
  },
};

const de: Strings = {
  notificationTitle: "Urban Explorer entdeckt mit dir",
  notificationBody: "Hört auf Orte in der Nähe, um sie beim Gehen zu erzählen.",
  common: {
    retry: "Erneut versuchen",
    ok: "OK",
    close: "Schließen",
    or: "oder",
    somethingWrong: "Etwas ist schiefgelaufen. Bitte erneut versuchen.",
  },
  tabs: { explore: "Entdecken", saved: "Gespeichert" },
  explore: {
    discover: "Entdecken",
    readyToExplore: "Bereit zum Entdecken",
    locating: "Standort wird ermittelt…",
    improvingGps: "GPS-Genauigkeit wird verbessert…",
    range: "Umkreis",
    rangeClose: "Nah",
    rangeMedium: "Mittel",
    rangeWide: "Weit",
    all: "Alle",
    driftBanner: "Du hast dich bewegt — tippen, um zu aktualisieren",
    startWalking: "Spaziergang starten",
    audioTourSubtitle: "Audio-Guide — Kopfhörer oder Lautsprecher",
    investigateTitle: "Adresse untersuchen",
    investigateSubtitle: "Neugierig auf ein bestimmtes Gebäude? Schlag's nach.",
    ratingPaceWarning: "Du bewertest schnell — lass dir Zeit",
    busyTitle: "Wir sind etwas beschäftigt",
    busyDetail: "Gerade viel los — versuche es gleich nochmal.",
    errorTitle: "Etwas ist schiefgelaufen",
    errorDetail: "Wir konnten keine Orte in der Nähe finden. Erneut versuchen.",
    nothingFoundTitle: "Nichts in der Nähe gefunden",
    nothingFoundDetail:
      "Keine Geschichten in diesem Umkreis. Versuche einen größeren Umkreis oder geh ein Stück weiter.",
    tryRange: (r) => `${r} m Umkreis versuchen`,
    searchAgain: "Erneut suchen",
    startExploringTitle: "Loslegen",
    startExploringDetail: "Tippe auf den Kompass, um spannende Orte zu entdecken",
    locationNotFound: "Ort nicht gefunden. Sei etwas genauer.",
    locationServiceBusy:
      "Standortdienst gerade nicht verfügbar — bitte gleich erneut versuchen.",
  },
  saved: {
    title: "Gespeichert",
    placeOne: "Ort",
    placeMany: "Orte",
    emptyTitle: "Noch keine gespeicherten Orte",
    emptyDetail: "Speichere Orte, die du entdeckst, um später wiederzukommen",
  },
  walkMode: {
    end: "Ende",
    walking: "Unterwegs",
    sparse: "Selten",
    dense: "Häufig",
    gettingLocation: "Standort wird abgerufen…",
    nowPlaying: "Wird abgespielt",
    listening: "Suche Geschichten in der Nähe…",
    keepWalking: "Geh weiter",
    storiesOften: "Geschichten werden häufig abgespielt",
    storiesAsYouGo: "Geschichten kommen unterwegs",
    storiesSoFar: (n) => `${n} ${n === 1 ? "Geschichte" : "Geschichten"} bisher`,
  },
  walkPlan: {
    title: "Spaziergang planen",
    subtitle: "Start und Ziel eingeben, um Geschichten vorher zu laden",
    startPlaceholder: "Startpunkt",
    endPlaceholder: "Ziel",
    findRoute: "Route finden",
    startWalk: "Spaziergang starten",
    searching: "Route suchen…",
    fetchingStops: "Geschichten entlang der Route laden…",
    stopsFound: (n) => `${n} ${n === 1 ? "Halt" : "Halte"} geladen`,
    noRoute: "Keine Fußgängerroute zwischen diesen Punkten gefunden.",
    routeError: "Route konnte nicht gefunden werden. Adressen prüfen.",
    geocodeError: "Adresse konnte nicht gefunden werden. Präziser eingeben.",
    previewLabel: "Entlang Ihrer Route",
    emptyRouteNote: "Keine Haltestellen vorgeladen — GPS findet Geschichten während Sie laufen.",
  },
  placeDetail: {
    quickFacts: "Kurzfakten",
    history: "Geschichte",
    architecture: "Architektur",
    notableEvents: "Wichtige Ereignisse",
    moreFunFacts: "Weitere Fun Facts",
    nearbyRelated: "Verwandtes in der Nähe",
    couldNotLoad: "Geschichte konnte nicht geladen werden. Verbindung prüfen und erneut versuchen.",
  },
  locationPermission: {
    titleSearch: "Ort suchen",
    titleEnable: "Standort aktivieren",
    descriptionSearch: "Gib eine Stadt, ein Viertel, eine Kreuzung oder Adresse ein.",
    descriptionEnable:
      "Urban Explorer braucht deinen Standort, um interessante Gebäude und historische Orte in deiner Nähe zu finden.",
    placeholder: "z. B. Greenwich Village, NYC",
    finding: "Suche Standort...",
    exploreThis: "Diesen Ort erkunden",
    backToResults: "Zurück zu den Ergebnissen",
    useCurrentInstead: "Aktuellen Standort verwenden",
    openSettings: "Einstellungen öffnen",
    deniedWeb:
      "Standortzugriff wurde abgelehnt. Aktiviere ihn in den Browser-Einstellungen oder suche unten einen Ort.",
    allow: "Standortzugriff erlauben",
    searchByLocation: "Nach Ort suchen",
    startWalking: "Spaziergang starten",
    walkSubtext: "Überspringen — zu Fuß mit Audio entdecken",
  },
  languageModal: {
    title: "App-Sprache",
    subtitle:
      "Wird in der ganzen App und für die Benachrichtigung beim Gehen verwendet. Die Benachrichtigung aktualisiert sich beim nächsten Spaziergang.",
    preview: "Vorschau",
  },
  placeCard: {
    topPick: "Top-Tipp",
    walkLessThan: "< 1 Min.",
    walkMin: (n) => `${n} Min.`,
    walkFt: (n) => `${n} ft`,
    walkMi: (s) => `${s} mi`,
    rateLimitTitle: "Etwas langsamer",
    rateLimitBody: "Du hast viele Orte bewertet — bitte in ein paar Minuten erneut versuchen.",
    saveErrTitle: "Bewertung nicht gespeichert",
    saveErrBody: "Etwas ist schiefgelaufen — Verbindung prüfen und erneut versuchen.",
  },
  placeActions: {
    playing: "Läuft",
    tellMore: "Mehr erzählen",
    headThere: "Hingehen",
    headingThere: "Auf dem Weg",
  },
  placeTimeline: {
    title: "Zeitreise",
    subtitle: "Sieh, wie sich dieser Ort durch die Geschichte entwickelt hat",
    loading: "Reise durch die Zeit...",
    error: "Zeitstrahl konnte nicht geladen werden. Verbindung prüfen und erneut versuchen.",
  },
  loadingMessages: {
    discovery: [
      "Stöbern in den Archiven...",
      "Alte Karten und Aufzeichnungen prüfen...",
      "Lokale Geheimnisse ausgraben...",
      "Was sich hier vor aller Augen versteckt...",
      "Deine persönliche Zeitmaschine wärmt sich auf...",
      "Erstelle deinen persönlichen Geschichts-Guide...",
      "Jeder Ort hat eine Geschichte — finde deine...",
      "Entdeckungen für diesen Ort werden erstellt — bitte warten...",
    ],
    detail: [
      "Tiefer in den Archiven graben...",
      "Die ganze Geschichte aufdecken...",
      "Vergessene Kapitel zusammensetzen...",
      "Eine Geschichte für diesen Ort entsteht...",
    ],
  },
  investigate: {
    headerTitle: "Adresse untersuchen",
    headerSubtitle: "Neugierig auf ein bestimmtes Gebäude? Frag den Historiker.",
    placeholder: "z. B. 538 W 38th St, New York, NY",
    investigate: "Untersuchen",
    hint:
      "Am besten für ältere oder unbekannte Gebäude, die du gesehen hast — die KI schließt aus Architektur und Umgebung, wenn Quellen knapp sind.",
    notFoundError:
      "Adresse nicht gefunden. Versuche es mit Stadt oder Postleitzahl.",
    busyError: "Wir sind etwas beschäftigt — kurz warten und erneut versuchen.",
    genericError: "Etwas ist schiefgelaufen. In einem Moment erneut versuchen.",
    originallyPrefix: "Ursprünglich:",
    sectionOriginally: "Ursprünglich",
    sectionToday: "Heute",
    sectionWhatToLookFor: "Worauf achten",
    sectionHistory: "Geschichte",
    sectionFacts: "Fakten & Details",
    sectionBlockContext: "Umgebung",
  },
  login: {
    title: "Urban Explorer",
    subtitle:
      "Entdecke die verborgene Geschichte um dich herum. Melde dich an oder erstelle ein kostenloses Konto.",
    cta: "Anmelden / Registrieren",
  },
  notFound: {
    stackTitle: "Hoppla!",
    title: "Dieser Bildschirm existiert nicht.",
    link: "Zur Startseite!",
  },
};

const it: Strings = {
  notificationTitle: "Urban Explorer sta esplorando con te",
  notificationBody: "In ascolto dei luoghi vicini da raccontare mentre cammini.",
  common: {
    retry: "Riprova",
    ok: "OK",
    close: "Chiudi",
    or: "o",
    somethingWrong: "Qualcosa è andato storto. Riprova.",
  },
  tabs: { explore: "Esplora", saved: "Salvati" },
  explore: {
    discover: "Scopri",
    readyToExplore: "Pronto a esplorare",
    locating: "Localizzazione…",
    improvingGps: "Miglioramento precisione GPS…",
    range: "Raggio",
    rangeClose: "Vicino",
    rangeMedium: "Medio",
    rangeWide: "Ampio",
    all: "Tutto",
    driftBanner: "Ti sei spostato — tocca per aggiornare",
    startWalking: "Inizia a camminare",
    audioTourSubtitle: "Guida audio — cuffie o altoparlante",
    investigateTitle: "Indaga un indirizzo",
    investigateSubtitle: "Curioso di un edificio? Cercalo.",
    ratingPaceWarning: "Stai votando in fretta — prenditi una pausa",
    busyTitle: "Siamo un po' impegnati",
    busyDetail: "C'è molto traffico ora — riprova tra poco.",
    errorTitle: "Qualcosa è andato storto",
    errorDetail: "Non abbiamo trovato luoghi vicini. Riprova.",
    nothingFoundTitle: "Niente trovato qui vicino",
    nothingFoundDetail:
      "Nessuna storia in questo raggio. Prova un raggio più ampio o spostati un po' più avanti.",
    tryRange: (r) => `Prova raggio di ${r} m`,
    searchAgain: "Cerca di nuovo",
    startExploringTitle: "Inizia a esplorare",
    startExploringDetail: "Tocca la bussola per scoprire luoghi interessanti vicino a te",
    locationNotFound: "Non abbiamo trovato quel luogo. Prova a essere più specifico.",
    locationServiceBusy:
      "Servizio di localizzazione non disponibile — riprova tra poco.",
  },
  saved: {
    title: "Salvati",
    placeOne: "luogo",
    placeMany: "luoghi",
    emptyTitle: "Ancora nessun luogo salvato",
    emptyDetail: "Salva i luoghi che scopri per ritrovarli più tardi",
  },
  walkMode: {
    end: "Fine",
    walking: "In cammino",
    sparse: "Rare",
    dense: "Frequenti",
    gettingLocation: "Recupero della tua posizione…",
    nowPlaying: "In riproduzione",
    listening: "In ascolto di storie vicine…",
    keepWalking: "Continua a camminare",
    storiesOften: "Le storie partiranno spesso",
    storiesAsYouGo: "Le storie partiranno mentre cammini",
    storiesSoFar: (n) => `${n} ${n === 1 ? "storia" : "storie"} finora`,
  },
  walkPlan: {
    title: "Pianifica una passeggiata",
    subtitle: "Inserisci partenza e destinazione per caricare le storie in anticipo",
    startPlaceholder: "Punto di partenza",
    endPlaceholder: "Destinazione",
    findRoute: "Trova percorso",
    startWalk: "Inizia passeggiata",
    searching: "Ricerca percorso…",
    fetchingStops: "Caricamento storie lungo il percorso…",
    stopsFound: (n) => `${n} ${n === 1 ? "tappa caricata" : "tappe caricate"}`,
    noRoute: "Nessun percorso pedonale trovato tra questi punti.",
    routeError: "Impossibile trovare il percorso. Controlla gli indirizzi.",
    geocodeError: "Impossibile trovare quell'indirizzo. Sii più specifico.",
    previewLabel: "Lungo il tuo percorso",
    emptyRouteNote: "Nessuna tappa precaricata — il GPS troverà storie durante la passeggiata.",
  },
  placeDetail: {
    quickFacts: "Fatti rapidi",
    history: "Storia",
    architecture: "Architettura",
    notableEvents: "Eventi notevoli",
    moreFunFacts: "Altre curiosità",
    nearbyRelated: "Correlati vicini",
    couldNotLoad: "Impossibile caricare la storia. Controlla la connessione e riprova.",
  },
  locationPermission: {
    titleSearch: "Cerca un luogo",
    titleEnable: "Abilita posizione",
    descriptionSearch: "Inserisci una città, quartiere, incrocio o indirizzo da esplorare.",
    descriptionEnable:
      "Urban Explorer ha bisogno della tua posizione per scoprire edifici e siti storici interessanti vicini a te.",
    placeholder: "es. Greenwich Village, NYC",
    finding: "Ricerca posizione...",
    exploreThis: "Esplora questo luogo",
    backToResults: "Torna ai risultati",
    useCurrentInstead: "Usa la mia posizione attuale",
    openSettings: "Apri impostazioni",
    deniedWeb:
      "Accesso alla posizione negato. Abilitalo nelle impostazioni del browser o cerca un luogo qui sotto.",
    allow: "Consenti la posizione",
    searchByLocation: "Cerca per luogo",
    startWalking: "Inizia a camminare",
    walkSubtext: "Salta — esplora a piedi con l'audio",
  },
  languageModal: {
    title: "Lingua dell'app",
    subtitle:
      "Usata in tutta l'app e per la notifica mostrata mentre cammini. La notifica si aggiorna alla prossima camminata.",
    preview: "Anteprima",
  },
  placeCard: {
    topPick: "Top",
    walkLessThan: "< 1 min",
    walkMin: (n) => `${n} min`,
    walkFt: (n) => `${n} ft`,
    walkMi: (s) => `${s} mi`,
    rateLimitTitle: "Rallenta un po'",
    rateLimitBody: "Hai votato molti luoghi — riprova tra qualche minuto.",
    saveErrTitle: "Voto non salvato",
    saveErrBody: "Qualcosa è andato storto — controlla la connessione e riprova.",
  },
  placeActions: {
    playing: "In riproduzione",
    tellMore: "Raccontami di più",
    headThere: "Vai lì",
    headingThere: "In viaggio",
  },
  placeTimeline: {
    title: "Viaggio nel tempo",
    subtitle: "Scopri come questo luogo è cambiato nel tempo",
    loading: "Viaggio nel tempo...",
    error: "Impossibile caricare la cronologia. Controlla la connessione e riprova.",
  },
  loadingMessages: {
    discovery: [
      "Si scava negli archivi...",
      "Si controllano vecchie mappe...",
      "Si dissotterrano segreti locali...",
      "Quello che si nasconde in piena vista...",
      "La tua macchina del tempo si sta scaldando...",
      "Costruisco la tua guida storica personale...",
      "Ogni luogo ha una storia — trovo la tua...",
      "Creo scoperte per questo posto — un attimo...",
    ],
    detail: [
      "Scavo più a fondo negli archivi...",
      "Scopro la storia completa...",
      "Ricompongo capitoli dimenticati...",
      "Creo una storia per questo luogo...",
    ],
  },
  investigate: {
    headerTitle: "Indaga un indirizzo",
    headerSubtitle: "Curioso di un edificio? Chiedi allo storico.",
    placeholder: "es., 538 W 38th St, New York, NY",
    investigate: "Indaga",
    hint:
      "Ideale per edifici vecchi o non famosi che hai notato — l'IA ragiona sull'architettura e il quartiere quando le fonti sono scarse.",
    notFoundError:
      "Indirizzo non trovato. Prova a includere città o codice postale.",
    busyError: "Siamo un po' impegnati — aspetta e riprova.",
    genericError: "Qualcosa è andato storto. Riprova tra poco.",
    originallyPrefix: "Originariamente:",
    sectionOriginally: "Originariamente",
    sectionToday: "Oggi",
    sectionWhatToLookFor: "Cosa osservare",
    sectionHistory: "Storia",
    sectionFacts: "Fatti e dettagli",
    sectionBlockContext: "Contesto del quartiere",
  },
  login: {
    title: "Urban Explorer",
    subtitle:
      "Scopri la storia nascosta intorno a te. Accedi o crea un account gratuito per iniziare.",
    cta: "Accedi / Registrati",
  },
  notFound: {
    stackTitle: "Ops!",
    title: "Questa schermata non esiste.",
    link: "Vai alla schermata principale!",
  },
};

const pt: Strings = {
  notificationTitle: "Urban Explorer está explorando com você",
  notificationBody: "Ouvindo lugares próximos para narrar enquanto você caminha.",
  common: {
    retry: "Tentar de novo",
    ok: "OK",
    close: "Fechar",
    or: "ou",
    somethingWrong: "Algo deu errado. Tente novamente.",
  },
  tabs: { explore: "Explorar", saved: "Salvos" },
  explore: {
    discover: "Descobrir",
    readyToExplore: "Pronto para explorar",
    locating: "Localizando…",
    improvingGps: "Melhorando a precisão do GPS…",
    range: "Alcance",
    rangeClose: "Perto",
    rangeMedium: "Médio",
    rangeWide: "Amplo",
    all: "Tudo",
    driftBanner: "Você se moveu — toque para atualizar esta área",
    startWalking: "Começar a caminhar",
    audioTourSubtitle: "Guia em áudio — fones ou alto-falante",
    investigateTitle: "Investigar um endereço",
    investigateSubtitle: "Curioso sobre um prédio específico? Procure.",
    ratingPaceWarning: "Você está avaliando rápido — vá com calma",
    busyTitle: "Estamos um pouco ocupados",
    busyDetail: "Movimento agora — tente de novo em instantes.",
    errorTitle: "Algo deu errado",
    errorDetail: "Não encontramos lugares por perto. Tente de novo.",
    nothingFoundTitle: "Nada encontrado por perto",
    nothingFoundDetail:
      "Nenhuma história nesta distância. Tente um alcance maior ou ande um pouco mais.",
    tryRange: (r) => `Tentar alcance de ${r} m`,
    searchAgain: "Buscar de novo",
    startExploringTitle: "Comece a explorar",
    startExploringDetail: "Toque na bússola para descobrir lugares interessantes ao seu redor",
    locationNotFound: "Não encontramos esse local. Tente ser mais específico.",
    locationServiceBusy:
      "Serviço de localização indisponível — tente novamente em instantes.",
  },
  saved: {
    title: "Salvos",
    placeOne: "lugar",
    placeMany: "lugares",
    emptyTitle: "Nenhum lugar salvo ainda",
    emptyDetail: "Marque lugares que descobrir para revisitar depois",
  },
  walkMode: {
    end: "Fim",
    walking: "Caminhando",
    sparse: "Esparsas",
    dense: "Frequentes",
    gettingLocation: "Obtendo sua localização…",
    nowPlaying: "Tocando agora",
    listening: "Procurando histórias por perto…",
    keepWalking: "Continue caminhando",
    storiesOften: "As histórias virão com frequência",
    storiesAsYouGo: "As histórias virão enquanto você caminha",
    storiesSoFar: (n) => `${n} ${n === 1 ? "história" : "histórias"} até agora`,
  },
  walkPlan: {
    title: "Planejar passeio",
    subtitle: "Insira início e destino para carregar histórias na rota",
    startPlaceholder: "Ponto de partida",
    endPlaceholder: "Destino",
    findRoute: "Encontrar rota",
    startWalk: "Iniciar passeio",
    searching: "Buscando rota…",
    fetchingStops: "Carregando histórias na rota…",
    stopsFound: (n) => `${n} ${n === 1 ? "parada carregada" : "paradas carregadas"}`,
    noRoute: "Nenhuma rota a pé encontrada entre esses pontos.",
    routeError: "Não foi possível encontrar a rota. Verifique os endereços.",
    geocodeError: "Não foi possível localizar esse endereço. Seja mais específico.",
    previewLabel: "Ao longo da sua rota",
    emptyRouteNote: "Nenhuma parada pré-carregada — o GPS encontrará histórias enquanto você caminha.",
  },
  placeDetail: {
    quickFacts: "Fatos rápidos",
    history: "História",
    architecture: "Arquitetura",
    notableEvents: "Eventos notáveis",
    moreFunFacts: "Mais curiosidades",
    nearbyRelated: "Relacionados por perto",
    couldNotLoad: "Não foi possível carregar a história. Verifique a conexão e tente novamente.",
  },
  locationPermission: {
    titleSearch: "Buscar um local",
    titleEnable: "Ativar localização",
    descriptionSearch: "Digite uma cidade, bairro, cruzamento ou endereço para explorar.",
    descriptionEnable:
      "O Urban Explorer precisa da sua localização para descobrir prédios e locais históricos interessantes perto de você.",
    placeholder: "ex. Greenwich Village, NYC",
    finding: "Buscando localização...",
    exploreThis: "Explorar este local",
    backToResults: "Voltar aos resultados",
    useCurrentInstead: "Usar minha localização atual",
    openSettings: "Abrir configurações",
    deniedWeb:
      "Acesso à localização negado. Ative-o nas configurações do navegador ou busque um local abaixo.",
    allow: "Permitir localização",
    searchByLocation: "Buscar por local",
    startWalking: "Começar a caminhar",
    walkSubtext: "Pule — explore a pé com áudio",
  },
  languageModal: {
    title: "Idioma do app",
    subtitle:
      "Usado em todo o app e na notificação exibida enquanto você caminha. A notificação atualiza na próxima caminhada.",
    preview: "Prévia",
  },
  placeCard: {
    topPick: "Destaque",
    walkLessThan: "< 1 min",
    walkMin: (n) => `${n} min`,
    walkFt: (n) => `${n} pés`,
    walkMi: (s) => `${s} mi`,
    rateLimitTitle: "Vai com calma",
    rateLimitBody: "Você avaliou muitos lugares — tente de novo em alguns minutos.",
    saveErrTitle: "Não salvou sua avaliação",
    saveErrBody: "Algo deu errado — verifique a conexão e tente novamente.",
  },
  placeActions: {
    playing: "Tocando",
    tellMore: "Conte-me mais",
    headThere: "Ir até lá",
    headingThere: "A caminho",
  },
  placeTimeline: {
    title: "Viagem no tempo",
    subtitle: "Veja como este lugar evoluiu ao longo da história",
    loading: "Viajando no tempo...",
    error: "Não foi possível carregar a linha do tempo. Verifique a conexão e tente novamente.",
  },
  loadingMessages: {
    discovery: [
      "Buscando nos arquivos...",
      "Conferindo mapas e registros antigos...",
      "Desenterrando segredos locais...",
      "O que se esconde à vista de todos...",
      "Sua máquina do tempo está esquentando...",
      "Montando seu guia histórico pessoal...",
      "Cada lugar tem uma história — encontrando a sua...",
      "Criando descobertas para este local — só um momento...",
    ],
    detail: [
      "Indo mais fundo nos arquivos...",
      "Descobrindo a história completa...",
      "Juntando capítulos esquecidos...",
      "Criando uma história para este lugar...",
    ],
  },
  investigate: {
    headerTitle: "Investigar um endereço",
    headerSubtitle: "Curioso sobre um prédio específico? Pergunte ao historiador.",
    placeholder: "ex., 538 W 38th St, New York, NY",
    investigate: "Investigar",
    hint:
      "Ideal para prédios antigos ou não famosos que você notou — a IA raciocina pela arquitetura e o bairro quando faltam registros.",
    notFoundError:
      "Endereço não encontrado. Tente incluir cidade ou CEP.",
    busyError: "Estamos um pouco ocupados — aguarde um momento e tente de novo.",
    genericError: "Algo deu errado. Tente de novo em instantes.",
    originallyPrefix: "Originalmente:",
    sectionOriginally: "Originalmente",
    sectionToday: "Hoje",
    sectionWhatToLookFor: "O que observar",
    sectionHistory: "História",
    sectionFacts: "Fatos e detalhes",
    sectionBlockContext: "Contexto do bairro",
  },
  login: {
    title: "Urban Explorer",
    subtitle:
      "Descubra a história escondida ao seu redor. Entre ou crie uma conta grátis para começar.",
    cta: "Entrar / Cadastrar",
  },
  notFound: {
    stackTitle: "Ops!",
    title: "Esta tela não existe.",
    link: "Voltar para o início!",
  },
};

const nl: Strings = {
  notificationTitle: "Urban Explorer verkent met je mee",
  notificationBody: "Luistert naar plekken in de buurt om te vertellen terwijl je loopt.",
  common: {
    retry: "Opnieuw",
    ok: "OK",
    close: "Sluiten",
    or: "of",
    somethingWrong: "Er ging iets mis. Probeer het opnieuw.",
  },
  tabs: { explore: "Verkennen", saved: "Opgeslagen" },
  explore: {
    discover: "Ontdek",
    readyToExplore: "Klaar om te verkennen",
    locating: "Locatie zoeken…",
    improvingGps: "GPS-nauwkeurigheid verbeteren…",
    range: "Bereik",
    rangeClose: "Dichtbij",
    rangeMedium: "Middel",
    rangeWide: "Breed",
    all: "Alles",
    driftBanner: "Je bent verplaatst — tik om te verversen",
    startWalking: "Begin met lopen",
    audioTourSubtitle: "Audio-gids — koptelefoon of speaker",
    investigateTitle: "Onderzoek een adres",
    investigateSubtitle: "Nieuwsgierig naar een gebouw? Zoek het op.",
    ratingPaceWarning: "Je beoordeelt snel — neem rustig de tijd",
    busyTitle: "We hebben het druk",
    busyDetail: "Het is nu druk — probeer het zo opnieuw.",
    errorTitle: "Er ging iets mis",
    errorDetail: "We konden geen plekken vinden. Probeer opnieuw.",
    nothingFoundTitle: "Niets in de buurt gevonden",
    nothingFoundDetail:
      "Geen verhalen in dit bereik. Probeer een groter bereik of loop iets verder.",
    tryRange: (r) => `Probeer ${r} m bereik`,
    searchAgain: "Opnieuw zoeken",
    startExploringTitle: "Begin met verkennen",
    startExploringDetail: "Tik op het kompas om interessante plekken te ontdekken",
    locationNotFound: "Locatie niet gevonden. Probeer specifieker te zijn.",
    locationServiceBusy: "Locatiedienst niet beschikbaar — probeer het zo opnieuw.",
  },
  saved: {
    title: "Opgeslagen",
    placeOne: "plek",
    placeMany: "plekken",
    emptyTitle: "Nog geen opgeslagen plekken",
    emptyDetail: "Sla plekken op die je ontdekt om later terug te bezoeken",
  },
  walkMode: {
    end: "Stop",
    walking: "Aan het lopen",
    sparse: "Spaarzaam",
    dense: "Vaak",
    gettingLocation: "Locatie ophalen…",
    nowPlaying: "Speelt nu",
    listening: "Op zoek naar verhalen in de buurt…",
    keepWalking: "Blijf lopen",
    storiesOften: "Verhalen spelen vaak af",
    storiesAsYouGo: "Verhalen spelen onderweg af",
    storiesSoFar: (n) => `${n} ${n === 1 ? "verhaal" : "verhalen"} tot nu toe`,
  },
  walkPlan: {
    title: "Wandeling plannen",
    subtitle: "Voer start en bestemming in om verhalen vooraf te laden",
    startPlaceholder: "Vertrekpunt",
    endPlaceholder: "Bestemming",
    findRoute: "Route zoeken",
    startWalk: "Wandeling starten",
    searching: "Route zoeken…",
    fetchingStops: "Verhalen laden langs de route…",
    stopsFound: (n) => `${n} ${n === 1 ? "stop geladen" : "stops geladen"}`,
    noRoute: "Geen wandelroute gevonden tussen deze punten.",
    routeError: "Route kon niet worden gevonden. Controleer de adressen.",
    geocodeError: "Adres kon niet worden gevonden. Wees specifieker.",
    previewLabel: "Langs uw route",
    emptyRouteNote: "Geen stops voorgeladen — GPS vindt verhalen terwijl u loopt.",
  },
  placeDetail: {
    quickFacts: "Korte feiten",
    history: "Geschiedenis",
    architecture: "Architectuur",
    notableEvents: "Opvallende gebeurtenissen",
    moreFunFacts: "Meer leuke feitjes",
    nearbyRelated: "Verwant in de buurt",
    couldNotLoad: "Geschiedenis kon niet worden geladen. Controleer je verbinding en probeer opnieuw.",
  },
  locationPermission: {
    titleSearch: "Zoek een locatie",
    titleEnable: "Locatie inschakelen",
    descriptionSearch: "Voer een stad, buurt, kruising of adres in om te verkennen.",
    descriptionEnable:
      "Urban Explorer heeft je locatie nodig om interessante gebouwen en historische plekken in de buurt te vinden.",
    placeholder: "bijv. Greenwich Village, NYC",
    finding: "Locatie zoeken...",
    exploreThis: "Verken deze locatie",
    backToResults: "Terug naar resultaten",
    useCurrentInstead: "Gebruik mijn huidige locatie",
    openSettings: "Instellingen openen",
    deniedWeb:
      "Locatietoegang geweigerd. Schakel deze in via je browser-instellingen of zoek hieronder een locatie.",
    allow: "Locatie toestaan",
    searchByLocation: "Zoek op locatie",
    startWalking: "Begin met lopen",
    walkSubtext: "Sla over — verken te voet met audio",
  },
  languageModal: {
    title: "Taal van de app",
    subtitle:
      "Gebruikt in de hele app en voor de melding tijdens het lopen. De melding wordt bij je volgende wandeling bijgewerkt.",
    preview: "Voorbeeld",
  },
  placeCard: {
    topPick: "Topkeuze",
    walkLessThan: "< 1 min",
    walkMin: (n) => `${n} min`,
    walkFt: (n) => `${n} ft`,
    walkMi: (s) => `${s} mi`,
    rateLimitTitle: "Even rustig aan",
    rateLimitBody: "Je hebt veel plekken beoordeeld — probeer het over een paar minuten opnieuw.",
    saveErrTitle: "Beoordeling niet opgeslagen",
    saveErrBody: "Er ging iets mis — controleer je verbinding en probeer opnieuw.",
  },
  placeActions: {
    playing: "Speelt",
    tellMore: "Vertel me meer",
    headThere: "Ga ernaartoe",
    headingThere: "Op weg",
  },
  placeTimeline: {
    title: "Tijdreis",
    subtitle: "Zie hoe deze plek door de geschiedenis is veranderd",
    loading: "Reizen door de tijd...",
    error: "Tijdlijn kon niet worden geladen. Controleer je verbinding en probeer opnieuw.",
  },
  loadingMessages: {
    discovery: [
      "Door de archieven graven...",
      "Oude kaarten en gegevens checken...",
      "Lokale geheimen opdiepen...",
      "Wat zich hier in het zicht verbergt...",
      "Je persoonlijke tijdmachine warmt op...",
      "Je persoonlijke geschiedenisgids samenstellen...",
      "Elke plek heeft een verhaal — die van jou zoeken...",
      "Ontdekkingen voor deze plek maken — even geduld...",
    ],
    detail: [
      "Dieper graven in de archieven...",
      "Het hele verhaal blootleggen...",
      "Vergeten hoofdstukken samenvoegen...",
      "Een geschiedenis voor deze plek maken...",
    ],
  },
  investigate: {
    headerTitle: "Onderzoek een adres",
    headerSubtitle: "Nieuwsgierig naar een gebouw? Vraag het de historicus.",
    placeholder: "bijv., 538 W 38th St, New York, NY",
    investigate: "Onderzoek",
    hint:
      "Ideaal voor oudere of onbekende gebouwen die je hebt opgemerkt — de AI redeneert vanuit architectuur en buurt als bronnen schaars zijn.",
    notFoundError:
      "Adres niet gevonden. Voeg een stad of postcode toe.",
    busyError: "Het is even druk — wacht een momentje en probeer opnieuw.",
    genericError: "Er ging iets mis. Probeer het zo opnieuw.",
    originallyPrefix: "Oorspronkelijk:",
    sectionOriginally: "Oorspronkelijk",
    sectionToday: "Vandaag",
    sectionWhatToLookFor: "Waar op te letten",
    sectionHistory: "Geschiedenis",
    sectionFacts: "Feiten & details",
    sectionBlockContext: "Buurt-context",
  },
  login: {
    title: "Urban Explorer",
    subtitle:
      "Ontdek de verborgen geschiedenis om je heen. Log in of maak een gratis account om te beginnen.",
    cta: "Inloggen / Registreren",
  },
  notFound: {
    stackTitle: "Oeps!",
    title: "Dit scherm bestaat niet.",
    link: "Naar het beginscherm!",
  },
};

const ja: Strings = {
  notificationTitle: "Urban Explorer があなたと一緒に探索中",
  notificationBody: "歩きながら案内できる近くの場所を探しています。",
  common: {
    retry: "再試行",
    ok: "OK",
    close: "閉じる",
    or: "または",
    somethingWrong: "問題が発生しました。もう一度お試しください。",
  },
  tabs: { explore: "探索", saved: "保存済み" },
  explore: {
    discover: "発見",
    readyToExplore: "探索の準備ができました",
    locating: "位置情報を取得中…",
    improvingGps: "GPS精度を向上中…",
    range: "範囲",
    rangeClose: "近い",
    rangeMedium: "中間",
    rangeWide: "広い",
    all: "すべて",
    driftBanner: "移動しました — タップしてこのエリアを更新",
    startWalking: "歩きはじめる",
    audioTourSubtitle: "オーディオガイド — ヘッドホンまたはスピーカー",
    investigateTitle: "住所を調査",
    investigateSubtitle: "気になる建物がありますか？調べましょう。",
    ratingPaceWarning: "評価のペースが速いです — ゆっくりどうぞ",
    busyTitle: "少し混み合っています",
    busyDetail: "現在混雑しています — しばらくしてから再試行してください。",
    errorTitle: "問題が発生しました",
    errorDetail: "近くの場所が見つかりませんでした。もう一度お試しください。",
    nothingFoundTitle: "近くに何も見つかりません",
    nothingFoundDetail:
      "この範囲には物語がありません。範囲を広げるか、少し先まで歩いてみてください。",
    tryRange: (r) => `${r}m の範囲を試す`,
    searchAgain: "再検索",
    startExploringTitle: "探索を始めよう",
    startExploringDetail: "コンパスをタップして、まわりの面白い場所を発見しよう",
    locationNotFound: "その場所が見つかりませんでした。もう少し具体的に入力してください。",
    locationServiceBusy: "位置情報サービスが利用できません — しばらくしてから再試行してください。",
  },
  saved: {
    title: "保存済み",
    placeOne: "件",
    placeMany: "件",
    emptyTitle: "保存された場所はまだありません",
    emptyDetail: "発見した場所をブックマークして、後で見返しましょう",
  },
  walkMode: {
    end: "終了",
    walking: "歩行中",
    sparse: "少なめ",
    dense: "多め",
    gettingLocation: "位置情報を取得中…",
    nowPlaying: "再生中",
    listening: "近くの物語を探しています…",
    keepWalking: "歩き続けてください",
    storiesOften: "頻繁に物語が再生されます",
    storiesAsYouGo: "歩きながら物語が再生されます",
    storiesSoFar: (n) => `これまでに${n}件の物語`,
  },
  walkPlan: {
    title: "ウォーク計画",
    subtitle: "出発地と目的地を入力してルートのストーリーを事前に読み込む",
    startPlaceholder: "出発地",
    endPlaceholder: "目的地",
    findRoute: "ルートを探す",
    startWalk: "ウォーク開始",
    searching: "ルートを検索中…",
    fetchingStops: "ルート沿いのストーリーを読み込み中…",
    stopsFound: (n) => `${n}件のストップを読み込みました`,
    noRoute: "2地点間のルートが見つかりませんでした。",
    routeError: "ルートが見つかりません。住所を確認してください。",
    geocodeError: "住所が見つかりません。より具体的に入力してください。",
    previewLabel: "ルート沿い",
    emptyRouteNote: "ストップは事前に読み込まれませんでした — 歩きながらGPSが物語を見つけます。",
  },
  placeDetail: {
    quickFacts: "簡単な事実",
    history: "歴史",
    architecture: "建築",
    notableEvents: "注目の出来事",
    moreFunFacts: "もっと豆知識",
    nearbyRelated: "近くの関連",
    couldNotLoad: "詳細な歴史を読み込めませんでした。接続を確認して再試行してください。",
  },
  locationPermission: {
    titleSearch: "場所を検索",
    titleEnable: "位置情報を有効化",
    descriptionSearch: "都市、地区、交差点、または住所を入力して探索してください。",
    descriptionEnable:
      "Urban Explorer が周辺の興味深い建物や歴史的な場所を発見するために、位置情報が必要です。",
    placeholder: "例：Greenwich Village, NYC",
    finding: "場所を検索中...",
    exploreThis: "この場所を探索",
    backToResults: "結果に戻る",
    useCurrentInstead: "現在地を使う",
    openSettings: "設定を開く",
    deniedWeb:
      "位置情報へのアクセスが拒否されました。ブラウザの設定で有効にするか、下から場所を検索してください。",
    allow: "位置情報を許可",
    searchByLocation: "場所で検索",
    startWalking: "歩きはじめる",
    walkSubtext: "スキップ — オーディオで歩いて探索",
  },
  languageModal: {
    title: "アプリの言語",
    subtitle:
      "アプリ全体と、歩行中に表示される通知に使用されます。通知は次回の散歩から反映されます。",
    preview: "プレビュー",
  },
  placeCard: {
    topPick: "おすすめ",
    walkLessThan: "1分未満",
    walkMin: (n) => `${n}分`,
    walkFt: (n) => `${n} ft`,
    walkMi: (s) => `${s} mi`,
    rateLimitTitle: "少し休みましょう",
    rateLimitBody: "最近たくさんの場所を評価しました — 数分後にお試しください。",
    saveErrTitle: "評価を保存できませんでした",
    saveErrBody: "問題が発生しました — 接続を確認して再試行してください。",
  },
  placeActions: {
    playing: "再生中",
    tellMore: "もっと教えて",
    headThere: "そこへ向かう",
    headingThere: "向かっています",
  },
  placeTimeline: {
    title: "タイムトラベル",
    subtitle: "この場所が歴史を通じてどう変わってきたかを見る",
    loading: "時を旅しています...",
    error: "タイムラインを読み込めませんでした。接続を確認して再試行してください。",
  },
  loadingMessages: {
    discovery: [
      "アーカイブを掘り下げています...",
      "古い地図と記録を確認中...",
      "地元の秘密を発掘中...",
      "ここに隠れているものは...",
      "あなた専用のタイムマシンを温めています...",
      "あなた専用の歴史ガイドを作成中...",
      "どの場所にも物語がある — あなたの物語を探しています...",
      "この場所のために発見を作成中 — 少々お待ちください...",
    ],
    detail: [
      "アーカイブをさらに深く掘り下げ中...",
      "全体の物語を解明中...",
      "忘れられた章をつなぎ合わせ中...",
      "この場所のために歴史を作成中...",
    ],
  },
  investigate: {
    headerTitle: "住所を調査",
    headerSubtitle: "気になる建物がありますか？歴史家に聞いてみましょう。",
    placeholder: "例：538 W 38th St, New York, NY",
    investigate: "調査する",
    hint:
      "実際に見かけた古い建物や知られていない建物に最適 — 記録が少ない時は、AIが建築や周辺から推測します。",
    notFoundError:
      "その住所が見つかりません。市区町村や郵便番号を含めてみてください。",
    busyError: "少し混み合っています — 少し待ってから再試行してください。",
    genericError: "問題が発生しました。少ししてからお試しください。",
    originallyPrefix: "もともと：",
    sectionOriginally: "もともと",
    sectionToday: "現在",
    sectionWhatToLookFor: "見どころ",
    sectionHistory: "歴史",
    sectionFacts: "事実と詳細",
    sectionBlockContext: "周辺の文脈",
  },
  login: {
    title: "Urban Explorer",
    subtitle:
      "あなたの周りに隠れた歴史を発見しましょう。ログインまたは無料登録して始めてください。",
    cta: "ログイン / 新規登録",
  },
  notFound: {
    stackTitle: "おっと！",
    title: "この画面は存在しません。",
    link: "ホーム画面へ！",
  },
};

const ko: Strings = {
  notificationTitle: "Urban Explorer가 함께 탐험하고 있어요",
  notificationBody: "걷는 동안 안내할 주변 장소를 찾고 있습니다.",
  common: {
    retry: "다시 시도",
    ok: "확인",
    close: "닫기",
    or: "또는",
    somethingWrong: "문제가 발생했습니다. 다시 시도해 주세요.",
  },
  tabs: { explore: "탐험", saved: "저장됨" },
  explore: {
    discover: "발견",
    readyToExplore: "탐험할 준비가 되었어요",
    locating: "위치 확인 중…",
    improvingGps: "GPS 정확도 향상 중…",
    range: "범위",
    rangeClose: "가까움",
    rangeMedium: "중간",
    rangeWide: "넓음",
    all: "전체",
    driftBanner: "위치가 바뀌었어요 — 새로고침하려면 누르세요",
    startWalking: "걷기 시작",
    audioTourSubtitle: "오디오 가이드 — 헤드폰 또는 스피커",
    investigateTitle: "주소 조사",
    investigateSubtitle: "특정 건물이 궁금한가요? 찾아보세요.",
    ratingPaceWarning: "평가가 너무 빨라요 — 천천히 하세요",
    busyTitle: "조금 바빠요",
    busyDetail: "지금 트래픽이 많아요 — 잠시 후 다시 시도해 주세요.",
    errorTitle: "문제가 발생했습니다",
    errorDetail: "근처에서 장소를 찾지 못했어요. 다시 시도해 주세요.",
    nothingFoundTitle: "근처에서 아무것도 찾지 못했어요",
    nothingFoundDetail:
      "이 범위에는 이야기가 없어요. 더 넓은 범위를 시도하거나 조금 더 걸어보세요.",
    tryRange: (r) => `${r}m 범위 시도`,
    searchAgain: "다시 검색",
    startExploringTitle: "탐험을 시작하세요",
    startExploringDetail: "나침반을 눌러 주변의 흥미로운 장소를 발견하세요",
    locationNotFound: "해당 위치를 찾지 못했어요. 더 구체적으로 입력해 주세요.",
    locationServiceBusy: "위치 서비스가 일시적으로 사용 불가합니다 — 잠시 후 다시 시도해 주세요.",
  },
  saved: {
    title: "저장됨",
    placeOne: "곳",
    placeMany: "곳",
    emptyTitle: "아직 저장된 장소가 없어요",
    emptyDetail: "발견한 장소를 북마크하고 나중에 다시 찾아보세요",
  },
  walkMode: {
    end: "종료",
    walking: "걷는 중",
    sparse: "드물게",
    dense: "자주",
    gettingLocation: "위치를 가져오는 중…",
    nowPlaying: "재생 중",
    listening: "주변 이야기를 듣는 중…",
    keepWalking: "계속 걸으세요",
    storiesOften: "이야기가 자주 재생됩니다",
    storiesAsYouGo: "걷는 동안 이야기가 재생됩니다",
    storiesSoFar: (n) => `지금까지 ${n}개의 이야기`,
  },
  walkPlan: {
    title: "걷기 계획",
    subtitle: "출발지와 목적지를 입력하여 경로의 이야기를 미리 불러오기",
    startPlaceholder: "출발지",
    endPlaceholder: "목적지",
    findRoute: "경로 찾기",
    startWalk: "걷기 시작",
    searching: "경로 검색 중…",
    fetchingStops: "경로 따라 이야기 불러오는 중…",
    stopsFound: (n) => `${n}개 정류장 불러옴`,
    noRoute: "두 지점 사이에 보행 경로를 찾을 수 없습니다.",
    routeError: "경로를 찾을 수 없습니다. 주소를 확인하세요.",
    geocodeError: "주소를 찾을 수 없습니다. 더 구체적으로 입력하세요.",
    previewLabel: "경로를 따라",
    emptyRouteNote: "정류장이 사전 로드되지 않았습니다 — GPS가 걸으면서 이야기를 찾습니다.",
  },
  placeDetail: {
    quickFacts: "간단한 사실",
    history: "역사",
    architecture: "건축",
    notableEvents: "주요 사건",
    moreFunFacts: "더 많은 흥미 사실",
    nearbyRelated: "주변 관련 장소",
    couldNotLoad: "상세 역사를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.",
  },
  locationPermission: {
    titleSearch: "위치 검색",
    titleEnable: "위치 사용",
    descriptionSearch: "도시, 동네, 교차로 또는 주소를 입력해 탐험하세요.",
    descriptionEnable:
      "Urban Explorer가 주변의 흥미로운 건물과 역사적 장소를 찾기 위해 위치 정보가 필요합니다.",
    placeholder: "예: Greenwich Village, NYC",
    finding: "위치 찾는 중...",
    exploreThis: "이 위치 탐험",
    backToResults: "결과로 돌아가기",
    useCurrentInstead: "현재 위치 사용",
    openSettings: "설정 열기",
    deniedWeb:
      "위치 접근이 거부되었어요. 브라우저 설정에서 활성화하거나 아래에서 위치를 검색하세요.",
    allow: "위치 접근 허용",
    searchByLocation: "위치로 검색",
    startWalking: "걷기 시작",
    walkSubtext: "건너뛰기 — 오디오와 함께 걸으며 탐험",
  },
  languageModal: {
    title: "앱 언어",
    subtitle:
      "앱 전체와 걷는 동안 표시되는 알림에 사용됩니다. 알림은 다음 산책 시 적용됩니다.",
    preview: "미리보기",
  },
  placeCard: {
    topPick: "추천",
    walkLessThan: "< 1분",
    walkMin: (n) => `${n}분`,
    walkFt: (n) => `${n} ft`,
    walkMi: (s) => `${s} mi`,
    rateLimitTitle: "조금 천천히",
    rateLimitBody: "최근 많은 장소를 평가했어요 — 몇 분 후 다시 시도해 주세요.",
    saveErrTitle: "평가를 저장하지 못했어요",
    saveErrBody: "문제가 발생했어요 — 연결을 확인하고 다시 시도해 주세요.",
  },
  placeActions: {
    playing: "재생 중",
    tellMore: "더 알려줘",
    headThere: "거기로 가기",
    headingThere: "가는 중",
  },
  placeTimeline: {
    title: "시간 여행",
    subtitle: "이 장소가 역사 속에서 어떻게 변화했는지 보세요",
    loading: "시간 속을 여행 중...",
    error: "타임라인을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.",
  },
  loadingMessages: {
    discovery: [
      "기록을 뒤지는 중...",
      "옛 지도와 자료를 확인하는 중...",
      "지역의 비밀을 캐는 중...",
      "이곳에 숨겨진 것을 찾는 중...",
      "당신만의 타임머신을 예열 중...",
      "당신만의 역사 가이드를 만드는 중...",
      "모든 장소에는 이야기가 있어요 — 당신의 이야기를 찾는 중...",
      "이 장소만의 발견을 준비 중 — 잠시만요...",
    ],
    detail: [
      "기록을 더 깊이 뒤지는 중...",
      "전체 이야기를 밝혀내는 중...",
      "잊혀진 장들을 모으는 중...",
      "이 장소만의 역사를 만드는 중...",
    ],
  },
  investigate: {
    headerTitle: "주소 조사",
    headerSubtitle: "특정 건물이 궁금한가요? 역사가에게 물어보세요.",
    placeholder: "예: 538 W 38th St, New York, NY",
    investigate: "조사하기",
    hint:
      "실제로 본 오래되거나 잘 알려지지 않은 건물에 가장 적합해요 — 자료가 부족할 때 AI가 건축과 동네를 통해 추론합니다.",
    notFoundError:
      "주소를 찾지 못했어요. 도시나 우편번호를 포함해 보세요.",
    busyError: "조금 바빠요 — 잠시 후 다시 시도해 주세요.",
    genericError: "문제가 발생했어요. 잠시 후 다시 시도해 주세요.",
    originallyPrefix: "원래:",
    sectionOriginally: "원래",
    sectionToday: "오늘",
    sectionWhatToLookFor: "볼거리",
    sectionHistory: "역사",
    sectionFacts: "사실과 세부사항",
    sectionBlockContext: "동네 맥락",
  },
  login: {
    title: "Urban Explorer",
    subtitle:
      "주변에 숨겨진 역사를 발견하세요. 로그인하거나 무료 계정을 만들어 시작하세요.",
    cta: "로그인 / 회원가입",
  },
  notFound: {
    stackTitle: "이런!",
    title: "이 화면은 존재하지 않아요.",
    link: "홈 화면으로!",
  },
};

const zh: Strings = {
  notificationTitle: "Urban Explorer 正在与你一起探索",
  notificationBody: "正在搜寻附近可讲解的地点。",
  common: {
    retry: "重试",
    ok: "确定",
    close: "关闭",
    or: "或",
    somethingWrong: "出了点问题，请再试一次。",
  },
  tabs: { explore: "探索", saved: "已保存" },
  explore: {
    discover: "发现",
    readyToExplore: "准备好探索了",
    locating: "定位中…",
    improvingGps: "正在提升 GPS 精度…",
    range: "范围",
    rangeClose: "很近",
    rangeMedium: "中等",
    rangeWide: "较远",
    all: "全部",
    driftBanner: "你已移动 — 点按刷新此区域",
    startWalking: "开始步行",
    audioTourSubtitle: "语音导览 — 耳机或扬声器",
    investigateTitle: "调查地址",
    investigateSubtitle: "对某个建筑感兴趣？查一查。",
    ratingPaceWarning: "你评分太快啦 — 慢慢来",
    busyTitle: "我们有点忙",
    busyDetail: "现在比较繁忙 — 请稍后重试。",
    errorTitle: "出了点问题",
    errorDetail: "附近没找到地点，请再试一次。",
    nothingFoundTitle: "附近没找到内容",
    nothingFoundDetail: "这个范围内没有故事。试试更大的范围或往前再走几步。",
    tryRange: (r) => `试试 ${r} 米范围`,
    searchAgain: "重新搜索",
    startExploringTitle: "开始探索",
    startExploringDetail: "点按指南针，发现身边有趣的地点",
    locationNotFound: "找不到该位置，请尝试更具体一些。",
    locationServiceBusy: "定位服务暂时不可用 — 请稍后再试。",
  },
  saved: {
    title: "已保存",
    placeOne: "个地点",
    placeMany: "个地点",
    emptyTitle: "还没有保存的地点",
    emptyDetail: "把你发现的地点收藏起来，方便以后回顾",
  },
  walkMode: {
    end: "结束",
    walking: "步行中",
    sparse: "稀疏",
    dense: "密集",
    gettingLocation: "正在获取你的位置…",
    nowPlaying: "正在播放",
    listening: "正在聆听附近的故事…",
    keepWalking: "继续走",
    storiesOften: "故事会经常播放",
    storiesAsYouGo: "走着走着会有故事",
    storiesSoFar: (n) => `已讲 ${n} 个故事`,
  },
  walkPlan: {
    title: "规划步行",
    subtitle: "输入起点和终点，提前加载沿途故事",
    startPlaceholder: "出发地",
    endPlaceholder: "目的地",
    findRoute: "查找路线",
    startWalk: "开始步行",
    searching: "正在查找路线…",
    fetchingStops: "正在加载沿途故事…",
    stopsFound: (n) => `已加载 ${n} 个站点`,
    noRoute: "未找到两点之间的步行路线。",
    routeError: "无法找到路线。请检查地址。",
    geocodeError: "无法找到该地址。请更具体地输入。",
    previewLabel: "沿途",
    emptyRouteNote: "未预加载站点 — GPS将在您步行时发现故事。",
  },
  placeDetail: {
    quickFacts: "速览",
    history: "历史",
    architecture: "建筑",
    notableEvents: "重要事件",
    moreFunFacts: "更多趣闻",
    nearbyRelated: "附近相关",
    couldNotLoad: "无法加载详细历史。请检查网络后重试。",
  },
  locationPermission: {
    titleSearch: "搜索地点",
    titleEnable: "启用定位",
    descriptionSearch: "输入城市、街区、路口或地址来探索。",
    descriptionEnable:
      "Urban Explorer 需要你的位置来发现附近有趣的建筑和历史遗迹。",
    placeholder: "如：Greenwich Village, NYC",
    finding: "正在查找位置...",
    exploreThis: "探索此位置",
    backToResults: "返回结果",
    useCurrentInstead: "使用我当前的位置",
    openSettings: "打开设置",
    deniedWeb:
      "位置访问被拒绝。请在浏览器设置中启用，或在下方搜索地点。",
    allow: "允许位置访问",
    searchByLocation: "按位置搜索",
    startWalking: "开始步行",
    walkSubtext: "跳过 — 步行配语音探索",
  },
  languageModal: {
    title: "应用语言",
    subtitle: "用于整个应用以及步行时显示的通知。通知会在你下次步行时更新。",
    preview: "预览",
  },
  placeCard: {
    topPick: "精选",
    walkLessThan: "< 1 分钟",
    walkMin: (n) => `${n} 分钟`,
    walkFt: (n) => `${n} 英尺`,
    walkMi: (s) => `${s} 英里`,
    rateLimitTitle: "请慢一点",
    rateLimitBody: "你最近评分了很多地点 — 请几分钟后再试。",
    saveErrTitle: "无法保存评分",
    saveErrBody: "出了点问题 — 请检查网络后重试。",
  },
  placeActions: {
    playing: "播放中",
    tellMore: "讲讲看",
    headThere: "前往",
    headingThere: "前往中",
  },
  placeTimeline: {
    title: "时光旅行",
    subtitle: "看看这个地方在历史中如何演变",
    loading: "穿越时空中...",
    error: "无法加载时间线。请检查网络后重试。",
  },
  loadingMessages: {
    discovery: [
      "正在翻阅档案……",
      "查阅旧地图和记录……",
      "挖掘当地的秘密……",
      "藏在眼前的故事……",
      "你的专属时光机正在预热……",
      "正在搭建你的专属历史指南……",
      "每个地点都有故事 — 正在寻找你的故事……",
      "为这个地点准备发现 — 请稍候……",
    ],
    detail: [
      "正在更深地翻阅档案……",
      "揭开完整的故事……",
      "拼接被遗忘的章节……",
      "为这个地点编写历史……",
    ],
  },
  investigate: {
    headerTitle: "调查地址",
    headerSubtitle: "对某个建筑感兴趣？请教历史学家。",
    placeholder: "如：538 W 38th St, New York, NY",
    investigate: "开始调查",
    hint:
      "最适合你亲眼见过的老建筑或非地标 — 资料稀缺时，AI 会从建筑风格和街区背景推断。",
    notFoundError: "没找到该地址。请尝试加上城市或邮编。",
    busyError: "我们有点忙 — 请稍候再试。",
    genericError: "出了点问题，请稍后再试。",
    originallyPrefix: "最初：",
    sectionOriginally: "最初",
    sectionToday: "如今",
    sectionWhatToLookFor: "看点",
    sectionHistory: "历史",
    sectionFacts: "事实与细节",
    sectionBlockContext: "街区背景",
  },
  login: {
    title: "Urban Explorer",
    subtitle: "发现你身边隐藏的历史。登录或免费注册以开始。",
    cta: "登录 / 注册",
  },
  notFound: {
    stackTitle: "哎呀！",
    title: "此页面不存在。",
    link: "回到首页！",
  },
};

export const TRANSLATIONS: Record<LocaleCode, Strings> = {
  en,
  es,
  fr,
  de,
  it,
  pt,
  nl,
  ja,
  ko,
  zh,
};

export const LOCALES: LocaleMeta[] = (
  [
    ["en", "English"],
    ["es", "Español"],
    ["fr", "Français"],
    ["de", "Deutsch"],
    ["it", "Italiano"],
    ["pt", "Português"],
    ["nl", "Nederlands"],
    ["ja", "日本語"],
    ["ko", "한국어"],
    ["zh", "中文"],
  ] as Array<[LocaleCode, string]>
).map(([code, label]) => ({
  code,
  label,
  notificationTitle: TRANSLATIONS[code].notificationTitle,
  notificationBody: TRANSLATIONS[code].notificationBody,
}));

export const DEFAULT_LOCALE: LocaleCode = "en";

export function isLocaleCode(code: string): code is LocaleCode {
  return code in TRANSLATIONS;
}

export function getStrings(code: string): Strings {
  return isLocaleCode(code) ? TRANSLATIONS[code] : TRANSLATIONS[DEFAULT_LOCALE];
}

export function getLocaleMeta(code: string): LocaleMeta {
  return (
    LOCALES.find((l) => l.code === code) ??
    LOCALES.find((l) => l.code === DEFAULT_LOCALE)!
  );
}
