// Real currently-admitted claims for the three blind subjects, transcribed
// verbatim from production sources (curatedLocalHistory.ts for
// way/349397298; experiments/hybrid-discovery-v0.1/report-nyc-tuesday-batch.json
// for the two Ephemeral New York subjects). No facts invented or altered.
// Library Hotel / Film Center Building are deliberately excluded — no real
// canonical claim set exists for them.
import type { ProducerInput } from "./types";

export const ACTORS_TEMPLE: ProducerInput = {
  subjectId: "way/265322610",
  subjectName: "Actors' Temple (339 West 47th Street)",
  claims: [
    {
      claimId:
        "eny-https-ephemeralnewyork-wordpress-com-2022-09-23-the-little-hells-kitchen-synagogue-where-old-broadway-stars-once-worshipped--eny-actors-temple-p4s1-use-history",
      claimType: "use-history",
      claimText:
        'Ephemeral New York\'s article "The little Hell\'s Kitchen synagogue where old Broadway stars once worshipped" states about 339 West 47th Street: "Performers like Sophie Tucker, Milton Berle, and Jack Benny came to services, and Ezrath Israel became known as the Actors\' Temple."',
    },
  ],
};

export const CLINTON_COURT: ProducerInput = {
  subjectId: "way/265320377",
  subjectName: "Clinton Court (422 West 46th Street)",
  claims: [
    {
      claimId:
        "eny-https-ephemeralnewyork-wordpress-com-2017-09-25-a-secret-alley-behind-a-street-in-hells-kitchen--eny-clinton-court-p16s0-use-history",
      claimType: "use-history",
      claimText:
        'Ephemeral New York\'s article "A secret alley behind a street in Hell\'s Kitchen" states about 422 West 46th Street: "In 1958, the tenements at 420 and 422 West 46th Street, the carriage house, and the studio became one single apartment complex entity, says Gray—serene seclusion steeped in New York history and mere steps from Midtown."',
    },
  ],
};

export const SPRING_GARDEN_1924: ProducerInput = {
  subjectId: "way/349397298",
  subjectName: "1924 Spring Garden Street",
  claims: [
    {
      claimId: "pab-75672-identity",
      claimType: "identity",
      claimText:
        'PAB\'s own record for 1924 SPRING GARDEN ST identifies this as "1924 Spring Garden Street."',
    },
    {
      claimId:
        "bp-unions-in-the-neighborhood-pab-record-75672-p79s0-construction-date",
      claimType: "construction-date",
      claimText:
        'Baldwin Park\'s page "Unions in the Neighborhood" states about 1924 SPRING GARDEN ST: "The squat new building at 1924 Spring Garden Street in 1971, built for the Ironworkers Union."',
    },
    {
      claimId: "pab-75672-register-status",
      claimType: "register-status",
      claimText:
        "PAB's record shows a historic-register listing entry for 1924 SPRING GARDEN ST, dated 10/11/2000.",
    },
    {
      claimId:
        "bp-unions-in-the-neighborhood-pab-record-75672-p76s0-institutional-founding",
      claimType: "institutional-founding",
      claimText:
        'Baldwin Park\'s page "Unions in the Neighborhood" states about 1924 SPRING GARDEN ST: "The International Association of Bridge, Structural, & Ornamental Iron Workers Union Local 401 (founded 1901), which had been at 1924 Spring Garden Street for at least four decades, sold the site to PSSU in 1993."',
    },
  ],
};

export const BLIND_SUBJECTS: ProducerInput[] = [
  ACTORS_TEMPLE,
  CLINTON_COURT,
  SPRING_GARDEN_1924,
];
