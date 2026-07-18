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
    cancel: string;
    or: string;
    somethingWrong: string;
  };
  tabs: { explore: string; saved: string; walk: string };
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
    nothingFoundFilteredTitle: string;
    nothingFoundFilteredDetail: string;
    tryRange: (r: number) => string;
    searchAgain: string;
    startExploringTitle: string;
    startExploringDetail: string;
    locationNotFound: string;
    locationServiceBusy: string;
    stillLoading: string;
  };
  saved: {
    title: string;
    placeOne: string;
    placeMany: string;
    emptyTitle: string;
    emptyDetail: string;
    noResults: string;
    noResultsDetail: string;
    searchPlaceholder: string;
    sortNewest: string;
    sortNearest: string;
    filterAll: string;
    mapToggle: string;
    notePlaceholder: string;
    noteSaved: string;
    savedConfirm: string;
    removedConfirm: string;
    editNote: string;
    deleteNote: string;
    swipeToDelete: string;
    noteModalTitle: string;
    noteModalLabel: string;
    noteModalPlaceholder: string;
    noteModalSave: string;
    noteModalDone: string;
    sortNearestNoLocation: string;
  };
  walkMode: {
    end: string;
    walking: string;
    walkingSubtitle: string;
    legendUpcoming: string;
    legendPlayed: string;
    legendPlaying: string;
    sparse: string;
    dense: string;
    gettingLocation: string;
    locationTakingLonger: string;
    nowPlaying: string;
    replayBadge: string;
    listening: string;
    keepWalking: string;
    storiesOften: string;
    storiesAsYouGo: string;
    storiesSoFar: (n: number) => string;
    buildingFilters: string;
    buildingFiltersDescription: string;
    showPrefetchStats: string;
    showPrefetchStatsDescription: string;
    developerSection: string;
    walkDebugOverlay: string;
    walkDebugOverlayDescription: string;
    nowPlayingPassedSuffix: string;
    buildingGroupResidential: string;
    buildingGroupResidentialDesc: string;
    buildingGroupAgricultural: string;
    buildingGroupAgriculturalDesc: string;
    buildingGroupParking: string;
    buildingGroupParkingDesc: string;
    buildingGroupUtility: string;
    buildingGroupUtilityDesc: string;
    nowPlayingPlaceAccessibility: (place: string) => string;
    endWalkAccessibility: string;
    fewerResultsAccessibility: string;
    moreResultsAccessibility: string;
    nextTurn: string;
    buildingFiltersAccessibility: string;
    resumeAccessibility: string;
    pauseAccessibility: string;
    skipAccessibility: string;
    confirmEndTitle: string;
    confirmEndMessage: string;
    confirmEndOk: string;
    confirmEndCancel: string;
    filterBtn: string;
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
    changeRoute: string;
    directionsLabel: string;
    arriveAtDestination: string;
  };
  placeDetail: {
    quickFacts: string;
    history: string;
    architecture: string;
    notableEvents: string;
    moreFunFacts: string;
    nearbyRelated: string;
    couldNotLoad: string;
    goBackAccessibility: string;
    saveAccessibility: string;
    removeSavedAccessibility: string;
    photoOf: string;
    retryHistoryAccessibility: string;
    lookUp: string;
    stillLoading: string;
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
    exploreHeadline: string;
    exploreBody: string;
    walkHeadline: string;
    walkBody: string;
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
    notFoundErrorTip: string;
    busyError: string;
    busyErrorTip: string;
    genericError: string;
    originallyPrefix: string;
    sectionOriginally: string;
    sectionToday: string;
    sectionWhatToLookFor: string;
    sectionHistory: string;
    sectionFacts: string;
    sectionBlockContext: string;
    stillLoading: string;
    nearestChipPrefix: string;
    nearestChipDismiss: string;
    tryDifferentName: string;
    emptyResult: string;
    emptyResultTip: string;
    searchSuggestionsPrefix: string;
    searchSuggestionsHint: string;
  };
  login: {
    title: string;
    tagline: string;
    subtitle: string;
    cta: string;
  };
  walk: {
    welcomeTitle: string;
    welcomeBody: string;
    welcomeDismiss: string;
    subtitle: string;
    editMessages: string;
  };
  notFound: {
    stackTitle: string;
    title: string;
    link: string;
  };
  headingBanner: {
    headingTo: string;
    tapToRetry: string;
    retryAudioAccessibility: string;
    loadingAudioAccessibility: string;
    resumeAudioAccessibility: string;
    pauseAudioAccessibility: string;
    stopHeadingAccessibility: string;
    headingToPlaceAccessibility: (place: string) => string;
    headingToPlaceWithDistanceAccessibility: (
      place: string,
      distance: string,
    ) => string;
    nowPlayingDeepDivePlaceAccessibility: (place: string) => string;
  };
  settingsMessages: {
    headerTitle: string;
    headerSubtitle: string;
    reset: string;
    resetAccessibility: string;
    resetConfirmTitle: string;
    resetConfirmMessage: string;
    addMessage: string;
    addMessageAccessibility: string;
    messagePlaceholder: string;
    deleteMessage: string;
    backAccessibility: string;
    discoverNearby: string;
    discoverNearbySubtitle: string;
    placeDetailTitle: string;
    placeDetailSubtitle: string;
  };
  placeDetailMap: {
    getDirections: string;
    openInMaps: string;
    getDirectionsSubtitle: string;
  };
}

const en: Strings = {
  notificationTitle: "Streetlit is walking with you",
  notificationBody: "Listening for nearby stories to narrate as you walk.",
  common: {
    retry: "Retry",
    ok: "OK",
    close: "Close",
    cancel: "Cancel",
    or: "or",
    somethingWrong: "Something went wrong. Please try again.",
  },
  tabs: { explore: "Explore", saved: "Saved", walk: "Walk" },
  explore: {
    discover: "Explore",
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
    errorTitle: "Streetlit couldn't search this area",
    errorDetail: "Check your connection and try again.",
    nothingFoundTitle: "Nothing found nearby",
    nothingFoundDetail: "Try moving the map or widening your search.",
    nothingFoundFilteredTitle: "Nothing quite right nearby yet",
    nothingFoundFilteredDetail:
      "Streetlit found nearby places, but not a story strong enough to show. Try a wider area.",
    tryRange: (r) => `Try ${r}m range`,
    searchAgain: "Search again",
    startExploringTitle: "Start Exploring",
    startExploringDetail:
      "Tap the compass to discover interesting places around you",
    locationNotFound: "Couldn't find that location. Try being more specific.",
    locationServiceBusy:
      "Location service is temporarily unavailable — try again in a moment.",
    stillLoading: "Taking longer than usual…",
  },
  saved: {
    title: "Saved",
    placeOne: "place",
    placeMany: "places",
    emptyTitle: "No saved places yet",
    emptyDetail: "Bookmark places you discover to revisit them later",
    noResults: "No results",
    noResultsDetail: "Try a different search or filter",
    searchPlaceholder: "Search saved places…",
    sortNewest: "Newest",
    sortNearest: "Nearest",
    filterAll: "All",
    mapToggle: "Map",
    notePlaceholder: "Add a note…",
    noteSaved: "Note saved",
    savedConfirm: "Saved",
    removedConfirm: "Removed",
    editNote: "Edit note",
    deleteNote: "Delete note",
    swipeToDelete: "Delete",
    noteModalTitle: "Saved",
    noteModalLabel: "Add a personal note (optional)",
    noteModalPlaceholder:
      "e.g. visited on a rainy Tuesday, loved the architecture…",
    noteModalSave: "Save note",
    noteModalDone: "Done",
    sortNearestNoLocation: "Allow location access to sort by distance",
  },
  walkMode: {
    end: "End",
    walking: "Walking",
    walkingSubtitle: "Listening for stories",
    legendUpcoming: "Upcoming",
    legendPlayed: "Played",
    legendPlaying: "Playing",
    sparse: "Fewer results",
    dense: "More results",
    gettingLocation: "Getting your location…",
    locationTakingLonger:
      "This is taking longer than usual. We're still trying to find your location.",
    nowPlaying: "Now playing",
    replayBadge: "Replay",
    listening: "Listening for stories nearby…",
    keepWalking: "Keep walking",
    storiesOften: "Stories will play often",
    storiesAsYouGo: "Stories will play as you go",
    storiesSoFar: (n) => `${n} ${n === 1 ? "story" : "stories"} so far`,
    buildingFilters: "Building Filters",
    buildingFiltersDescription: "Include these building types in walk stories",
    showPrefetchStats: "Show prefetch stats",
    showPrefetchStatsDescription:
      "Display the cache hit-rate counter at the bottom of the screen",
    developerSection: "Developer",
    walkDebugOverlay: "Walk debug overlay",
    walkDebugOverlayDescription:
      "Show a live diagnostic panel during walks: GPS, heading, candidates, and rejection reasons. For field testing.",
    nowPlayingPassedSuffix: "(passed)",
    buildingGroupResidential: "Residential",
    buildingGroupResidentialDesc: "Huts, sheds, roof structures",
    buildingGroupAgricultural: "Agricultural",
    buildingGroupAgriculturalDesc: "Barns, greenhouses, silos",
    buildingGroupParking: "Parking & Storage",
    buildingGroupParkingDesc: "Garages, carports, containers",
    buildingGroupUtility: "Utilities & Facilities",
    buildingGroupUtilityDesc: "Service buildings, kiosks, toilets",
    nowPlayingPlaceAccessibility: (place) => `Now playing: ${place}`,
    endWalkAccessibility: "End walk",
    fewerResultsAccessibility: "Fewer results",
    moreResultsAccessibility: "More results",
    nextTurn: "Next turn",
    buildingFiltersAccessibility: "Building filters",
    resumeAccessibility: "Resume",
    pauseAccessibility: "Pause",
    skipAccessibility: "Skip",
    confirmEndTitle: "End this walk?",
    confirmEndMessage:
      "This stops narration and background location. Your recent routes stay saved on this device.",
    confirmEndOk: "End Walk",
    confirmEndCancel: "Keep Walking",
    filterBtn: "Filters",
  },
  walkPlan: {
    title: "Plan a Walk",
    subtitle: "Enter start and end to preview places along your route",
    startPlaceholder: "e.g. Central Park, New York",
    endPlaceholder: "e.g. Times Square, New York",
    findRoute: "Find Route",
    startWalk: "Start Walk",
    searching: "Finding route…",
    fetchingStops: "Finding places along route…",
    stopsFound: (n) => `${n} ${n === 1 ? "place" : "places"} along route`,
    noRoute: "No walking route found between those points.",
    routeError: "Couldn't find a route. Check your addresses and try again.",
    geocodeError: "Couldn't locate that address. Try being more specific.",
    previewLabel: "Along your route",
    emptyRouteNote:
      "No stops were pre-loaded — GPS discovery will find stories as you walk.",
    changeRoute: "Change route",
    directionsLabel: "Directions",
    arriveAtDestination: "Arrive at your destination",
  },
  placeDetail: {
    quickFacts: "Quick Facts",
    history: "History",
    architecture: "Architecture",
    notableEvents: "Notable Events",
    moreFunFacts: "More Fun Facts",
    nearbyRelated: "Nearby Related",
    couldNotLoad:
      "Could not load detailed history. Check your connection and try again.",
    goBackAccessibility: "Go back",
    saveAccessibility: "Save",
    removeSavedAccessibility: "Remove from saved",
    photoOf: "Photo of",
    retryHistoryAccessibility: "Retry loading history",
    lookUp: "Look up",
    stillLoading: "Taking longer than usual…",
  },
  locationPermission: {
    titleSearch: "Search a Location",
    titleEnable: "Enable Location",
    descriptionSearch:
      "Enter a city, neighborhood, intersection, or address to explore.",
    descriptionEnable:
      "Streetlit uses your location to find nearby stories. We don't use it to build a profile or track where you've been.",
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
    exploreHeadline: "Browse the hidden layers of a place.",
    exploreBody: "See what's around me.",
    walkHeadline: "Listen to the city unfold around you.",
    walkBody: "Go for a walk.",
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
    rateLimitBody:
      "You've rated a lot of places recently — try again in a few minutes.",
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
    subtitle: "See how this place may have changed over time",
    loading: "Traveling through time...",
    error: "Could not load timeline. Check your connection and try again.",
  },
  loadingMessages: {
    discovery: [
      "Looking for the stories this block still remembers...",
      "Reading the neighborhood between the lines...",
      "Looking for stories nearby...",
      "Seeing what this block remembers...",
      "Finding the layers beneath the surface...",
      "Looking for something interesting...",
      "Reading the neighborhood a little closer...",
      "Connecting the dots...",
      "History is messy. Hang on...",
      "Looking for the stories people walked past...",
      "Searching for traces that still remain...",
      "One moment — the city is thinking...",
      "Trying not to get distracted by ghost signs...",
      "Connecting what's here now to what came before...",
      "Looking for the good stuff...",
      "Following the clues in the streetscape...",
      "Looking for what this block used to be...",
    ],
    detail: [
      "Looking closer at this place...",
      "Pulling the story together...",
      "Checking the deeper context...",
      "Digging a little deeper...",
      "Following the thread...",
      "Reading between the layers...",
      "Gathering the details...",
      "Some stories take a minute...",
      "Finding the thread worth following...",
      "Trying to separate myth from reality...",
      "Looking for what still survives here...",
      "Putting the pieces together...",
      "Double-checking the map...",
      "History rarely labels itself clearly...",
      "Finding the human part...",
      "Looking for the part worth noticing...",
      "Pulling the useful clues together...",
    ],
  },
  investigate: {
    headerTitle: "Investigate an Address",
    headerSubtitle:
      "Curious about a specific place? See what Streetlit turns up.",
    placeholder: "e.g., 538 W 38th St, New York, NY",
    investigate: "Investigate",
    hint: "Works best with a specific address or place name — obscure is welcome.",
    notFoundError:
      "Couldn't find that address. Try including a city or zip (e.g., '538 W 38th St, New York, NY').",
    notFoundErrorTip:
      "Try a street address or neighbourhood name, and include the city or zip code.",
    busyError: "We're a bit busy — give it a moment and try again.",
    busyErrorTip: "Try again in a moment.",
    genericError: "Something went wrong. Try again in a moment.",
    originallyPrefix: "Originally:",
    sectionOriginally: "Originally",
    sectionToday: "Today",
    sectionWhatToLookFor: "What to look for",
    sectionHistory: "History",
    sectionFacts: "Facts & details",
    sectionBlockContext: "Block context",
    stillLoading: "Looking for traces… this usually takes 15–25 seconds.",
    nearestChipPrefix: "Nearest:",
    nearestChipDismiss: "Dismiss suggestion",
    tryDifferentName: "Try a different name",
    emptyResult:
      "We couldn't find much about this place. Try a different name or nearby address.",
    emptyResultTip:
      "Tip: Try a nearby intersection, include the city name, or use a well-known landmark as a reference.",
    searchSuggestionsPrefix: "Try:",
    searchSuggestionsHint:
      "Tap to pre-fill this suggestion in the search input",
  },
  login: {
    title: "Streetlit",
    tagline: "Discover history, explore places, hear their stories.",
    subtitle: "Discover the stories hidden in ordinary places.",
    cta: "Log in / Sign up",
  },
  walk: {
    welcomeTitle: "Welcome to Walk Mode",
    welcomeBody:
      "Tap Start Walking to hear stories about places you pass, or Plan a Route to pre-load a path.",
    welcomeDismiss: "Got it",
    subtitle: "Explore the city with live audio stories",
    editMessages: "Edit messages",
  },
  notFound: {
    stackTitle: "Oops!",
    title: "This screen doesn't exist.",
    link: "Go to home screen!",
  },
  headingBanner: {
    headingTo: "Heading to",
    tapToRetry: "Tap to retry.",
    retryAudioAccessibility: "Retry deep dive audio",
    loadingAudioAccessibility: "Loading audio",
    resumeAudioAccessibility: "Resume audio",
    pauseAudioAccessibility: "Pause audio",
    stopHeadingAccessibility: "Stop heading",
    headingToPlaceAccessibility: (place) => `Heading to ${place}`,
    headingToPlaceWithDistanceAccessibility: (place, distance) =>
      `Heading to ${place}, ${distance} away`,
    nowPlayingDeepDivePlaceAccessibility: (place) =>
      `Now playing deep dive about ${place}`,
  },
  settingsMessages: {
    headerTitle: "Loading Messages",
    headerSubtitle: "Shown while the AI is thinking",
    reset: "Reset",
    resetAccessibility: "Reset to defaults",
    resetConfirmTitle: "Reset to defaults?",
    resetConfirmMessage:
      "This will restore all default messages. This cannot be undone.",
    addMessage: "Add Message",
    addMessageAccessibility: "Add a new message",
    messagePlaceholder: "Enter a message...",
    deleteMessage: "Delete message",
    backAccessibility: "Back",
    discoverNearby: "Discover Nearby",
    discoverNearbySubtitle: "Shown while scanning for places around you",
    placeDetailTitle: "Place Detail",
    placeDetailSubtitle: "Shown while loading a specific place's story",
  },
  placeDetailMap: {
    getDirections: "Get Directions",
    openInMaps: "Open in Maps",
    getDirectionsSubtitle: "Get directions to this spot",
  },
};

// Launch: English-only. Non-English entries are removed so the language
// picker shows only English and getLocaleMeta() always resolves to English.
// Non-English locale files (lib/locales/*) and loadStrings() cases are kept
// intact and can be re-enabled by restoring entries here and in LOCALE_CODES.
export const LOCALES: LocaleMeta[] = [
  {
    code: "en",
    label: "English",
    notificationTitle: "Streetlit is walking with you",
    notificationBody: "Listening for nearby stories to narrate as you walk.",
  },
];

export const DEFAULT_LOCALE: LocaleCode = "en";

// Launch: English-only. Non-English codes are intentionally excluded so that
// matchDeviceLocale() always falls back to "en" and no non-English strings
// are ever active in the UI. The LocaleCode type and loadStrings() switch are
// kept intact so they can be re-enabled without structural changes.
const LOCALE_CODES = new Set<string>(["en"]);

export function isLocaleCode(code: string): code is LocaleCode {
  return LOCALE_CODES.has(code);
}

// Synchronous fast path — always returns English.
// For non-English locales call loadStrings() which returns a Promise.
export function getStrings(_code: string): Strings {
  return en;
}

// Asynchronously load the Strings for the given locale code.
// English is returned immediately (no dynamic import needed).
// All other locales are split into separate chunks loaded on demand.
export async function loadStrings(code: string): Promise<Strings> {
  if (!isLocaleCode(code) || code === DEFAULT_LOCALE) return en;
  switch (code) {
    case "es":
      return (await import("./locales/es")).default;
    case "fr":
      return (await import("./locales/fr")).default;
    case "de":
      return (await import("./locales/de")).default;
    case "it":
      return (await import("./locales/it")).default;
    case "pt":
      return (await import("./locales/pt")).default;
    case "nl":
      return (await import("./locales/nl")).default;
    case "ja":
      return (await import("./locales/ja")).default;
    case "ko":
      return (await import("./locales/ko")).default;
    case "zh":
      return (await import("./locales/zh")).default;
    default:
      return en;
  }
}

export function getLocaleMeta(code: string): LocaleMeta {
  return (
    LOCALES.find((l) => l.code === code) ??
    LOCALES.find((l) => l.code === DEFAULT_LOCALE)!
  );
}

export type MeasurementSystem = "metric" | "imperial";

// English is the only locale that defaults to imperial units. Every other
// locale we ship (es, fr, de, it, pt, nl, ja, ko, zh) is metric.
// We only carry language-level codes (e.g. "en"), not regional variants like
// "en-GB", so any future need to opt en-GB into metric would have to come
// through an explicit user preference.
export function getMeasurementSystem(code: string): MeasurementSystem {
  return code === "en" ? "imperial" : "metric";
}
