/** Plain-language definitions used by <Term> tooltips across the app. */
export type GlossaryEntry = { term: string; short: string; more?: string };

export const GLOSSARY = {
  turnaround: {
    term: "Turnaround",
    short: "The time an aircraft spends on the ground between two flights: passengers off, cleaning, fuel, bags, passengers on.",
    more: "A short-haul jet usually needs 25 to 55 minutes; a wide-body jet 60 minutes or more. If the incoming flight lands late, there may not be enough time left before the next departure.",
  },
  rotation: {
    term: "Aircraft rotation",
    short: "The sequence of flights one aircraft flies in a day. Your plane usually arrives from somewhere else just before your flight.",
    more: "Vola only links flights when a data provider names the same aircraft (by registration) on both. It never guesses from routes or flight numbers.",
  },
  registration: {
    term: "Registration",
    short: "An aircraft's unique ID, painted on the fuselage (for example G-EUYA or N12345). Also called the tail number.",
  },
  propagation: {
    term: "Delay propagation",
    short: "When a late incoming aircraft makes the next flight late, and that one makes the following flight late.",
    more: "Vola estimates it from the incoming arrival time and the time the aircraft needs on the ground, as a range of minutes.",
  },
  knockOn: {
    term: "Knock-on delay",
    short: "Delay passed from one flight to the next because the same aircraft operates both.",
  },
  groundTime: {
    term: "Scheduled ground time",
    short: "The gap the timetable allows between the incoming flight's arrival and the next departure.",
  },
  probability: {
    term: "Probability",
    short: "Out of many flights like this one, roughly how many would be at least this late. 30% means about 3 in 10.",
    more: "Shown only when Vola's trained model applies to the flight, alongside how well that model did on flights it had never seen.",
  },
  calibration: {
    term: "Calibration",
    short: "Whether predicted chances match reality: of flights given a 30% chance, about 30% should actually be late.",
  },
  corroboration: {
    term: "Corroboration",
    short: "Independent people reporting the same thing. One report is unverified; several recent, matching reports from different people are stronger.",
    more: "Repeated reports from the same person count once, older reports count less, and reports that contradict each other are marked as contested.",
  },
  predeparture: {
    term: "Pre-departure forecast",
    short: "A forecast made before the aircraft leaves the gate, from the schedule, history, weather and the incoming aircraft.",
  },
  enroute: {
    term: "En-route update",
    short: "A forecast made after the aircraft has left, when its actual departure time is known. Usually much more accurate.",
  },
  adsb: {
    term: "ADS-B",
    short: "Position reports broadcast by the aircraft itself and collected by volunteer receivers. Vola uses them to time takeoff and landing.",
  },
  gateArrival: {
    term: "Gate arrival",
    short: "When the aircraft reaches the gate and the doors can open. EU and UK rules measure delay at this moment, not touchdown.",
  },
  eu261: {
    term: "EU261",
    short: "EU rules giving fixed compensation (250 to 600 euros) when you arrive 3+ hours late, unless the cause was extraordinary.",
  },
  uk261: {
    term: "UK261",
    short: "The UK's version of EU261 after Brexit, with amounts in pounds (220 to 520).",
  },
  montreal: {
    term: "Montreal Convention",
    short: "The international treaty covering bags on international flights. Report damage within 7 days and a delayed bag within 21 days.",
  },
  pir: {
    term: "PIR",
    short: "Property Irregularity Report: the form you fill in at the airline's baggage desk before leaving the airport. Keep its reference.",
  },
  extraordinary: {
    term: "Extraordinary circumstances",
    short: "Events outside the airline's control (severe weather, air traffic control restrictions, security). They can cancel the right to compensation, but not to care.",
  },
  sdr: {
    term: "SDR",
    short: "Special Drawing Right, an IMF currency unit used for baggage liability limits. Its value changes daily.",
  },
  confidence: {
    term: "Data confidence",
    short: "How complete and current the information behind a forecast is. It isn't a probability; it tells you how much to trust the forecast.",
  },
  sourceTypes: {
    term: "Source types",
    short: "Official: airline or schedule data. Aircraft: positions broadcast by the plane. Passengers: reports from people on the flight. Each is labelled.",
  },
} satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;
