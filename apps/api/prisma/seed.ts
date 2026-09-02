import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5);
const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000);

async function main() {
  const pwd = await bcrypt.hash('gmao1234', 10);

  // ── purge complète (hors comptes utilisateurs) : seed ré-exécutable et sans résidu ──
  await prisma.$transaction([
    prisma.costLine.deleteMany(),
    prisma.ticketPart.deleteMany(),
    prisma.stockMovement.deleteMany(),
    prisma.externalInvoice.deleteMany(),
    prisma.ticketSignature.deleteMany(),
    prisma.ticketAttachment.deleteMany(),
    prisma.ticketEvent.deleteMany(),
    prisma.intervention.deleteMany(),
    prisma.meterReading.deleteMany(),
    prisma.ticket.deleteMany(),
    prisma.stockItem.deleteMany(),
    prisma.part.deleteMany(),
    prisma.equipmentAssignment.deleteMany(),
    prisma.preventivePlan.deleteMany(),
    prisma.equipment.deleteMany(),
    prisma.site.deleteMany(),
    prisma.technicalLot.deleteMany(),
    prisma.provider.deleteMany(),
  ]);

  // ── utilisateurs ──
  const [admin, chef, chef2, respo, tech, tech2] = await Promise.all([
    prisma.user.upsert({ where: { email: 'admin@gmao.local' }, update: {}, create: { email: 'admin@gmao.local', passwordHash: pwd, fullName: 'Administrateur', role: 'ADMIN' } }),
    prisma.user.upsert({ where: { email: 'chef@gmao.local' }, update: {}, create: { email: 'chef@gmao.local', passwordHash: pwd, fullName: 'Amadou Diallo', role: 'FIELD_MANAGER', phone: '+221 77 100 00 01' } }),
    prisma.user.upsert({ where: { email: 'chef2@gmao.local' }, update: {}, create: { email: 'chef2@gmao.local', passwordHash: pwd, fullName: 'Awa Sow', role: 'FIELD_MANAGER', phone: '+221 77 100 00 02' } }),
    prisma.user.upsert({ where: { email: 'parc@gmao.local' }, update: {}, create: { email: 'parc@gmao.local', passwordHash: pwd, fullName: 'Fatou Ndiaye', role: 'PARK_MANAGER' } }),
    prisma.user.upsert({ where: { email: 'meca@gmao.local' }, update: {}, create: { email: 'meca@gmao.local', passwordHash: pwd, fullName: 'Ousmane Ba', role: 'MECHANIC' } }),
    prisma.user.upsert({ where: { email: 'meca2@gmao.local' }, update: {}, create: { email: 'meca2@gmao.local', passwordHash: pwd, fullName: 'Cheikh Fall', role: 'MECHANIC' } }),
  ]);
  void admin;

  // ── prestataires (sous-traitants) ──
  const [ascProv, ssiProv, elcProv] = await Promise.all([
    prisma.provider.upsert({ where: { id: 'seed-prov-asc' }, update: {}, create: { id: 'seed-prov-asc', name: 'Otis Sénégal — Contrat ascenseurs', contactName: 'M. Diouf', phone: '+221 33 869 00 00' } }),
    prisma.provider.upsert({ where: { id: 'seed-prov-ssi' }, update: {}, create: { id: 'seed-prov-ssi', name: 'SICLI Prévention Incendie', contactName: 'Mme Sy', phone: '+221 33 820 11 22' } }),
    prisma.provider.upsert({ where: { id: 'seed-prov-elc' }, update: {}, create: { id: 'seed-prov-elc', name: 'Schneider Services Ouest', contactName: 'M. Faye', phone: '+221 33 839 44 55' } }),
  ]);

  // ── lots techniques (axe d'imputation, cf. procédure) ──
  const lotDefs = [
    { code: 'ASC', name: 'Ascenseurs & appareils élévateurs', defaultFrequency: 'Mensuel', isRegulatory: true, color: '#7c3aed' },
    { code: 'SSI', name: 'Sécurité incendie', defaultFrequency: 'Trimestriel', isRegulatory: true, color: '#dc2626' },
    { code: 'PLB', name: 'Plomberie & réseaux', defaultFrequency: 'Mensuel', isRegulatory: false, color: '#0891b2' },
    { code: 'ELC', name: 'Électricité HT/BT', defaultFrequency: 'Semestriel', isRegulatory: true, color: '#f59e0b' },
    { code: 'GE', name: 'Groupe électrogène', defaultFrequency: 'Hebdomadaire', isRegulatory: false, color: '#16a34a' },
    { code: 'ARC', name: 'Lots architecturaux (second œuvre)', defaultFrequency: 'Trimestriel', isRegulatory: false, color: '#64748b' },
    { code: 'NET', name: 'Nettoyage & entretien', defaultFrequency: 'Quotidien', isRegulatory: false, color: '#2563eb' },
  ];
  const lots: Record<string, { id: string }> = {};
  for (const l of lotDefs) {
    lots[l.code] = await prisma.technicalLot.upsert({ where: { code: l.code }, update: l, create: l });
  }

  // ── projets / immeubles ──
  const sites = await Promise.all([
    prisma.site.upsert({ where: { code: 'IMM-ALM-01' }, update: {}, create: { code: 'IMM-ALM-01', name: 'Siège social — Almadies', address: 'Route des Almadies, Dakar', startDate: daysAgo(400) } }),
    prisma.site.upsert({ where: { code: 'CCM-SPZ-02' }, update: {}, create: { code: 'CCM-SPZ-02', name: 'Centre commercial Sea Plaza', address: 'Corniche Ouest, Dakar', startDate: daysAgo(300) } }),
    prisma.site.upsert({ where: { code: 'RES-FIL-03' }, update: {}, create: { code: 'RES-FIL-03', name: 'Résidence Les Filaos', address: 'Saly Portudal', startDate: daysAgo(180) } }),
  ]);
  const [siege, ccm, res] = sites;

  // ── actifs techniques (organes / installations / équipements) ──
  const eqDefs = [
    { s: siege, lot: 'ASC', zone: 'Noyau central', type: 'CAB', name: 'Ascenseur A — cabine 8 personnes', kind: 'INSTALLATION', crit: 'CRITIQUE', meter: 'NONE', status: 'EN_SERVICE' },
    { s: siege, lot: 'ASC', zone: 'Noyau central', type: 'MCH', name: 'Ascenseur B — monte-charge 1000 kg', kind: 'INSTALLATION', crit: 'IMPORTANT', meter: 'NONE', status: 'EN_PANNE' },
    { s: siege, lot: 'SSI', zone: 'RDC — PC sécurité', type: 'CEN', name: 'Centrale SSI adressable', kind: 'INSTALLATION', crit: 'CRITIQUE', meter: 'NONE', status: 'EN_SERVICE' },
    { s: siege, lot: 'SSI', zone: 'Toiture', type: 'DES', name: 'Groupe de désenfumage mécanique', kind: 'EQUIPEMENT', crit: 'CRITIQUE', meter: 'NONE', status: 'EN_MAINTENANCE' },
    { s: siege, lot: 'PLB', zone: 'Sous-sol 1', type: 'SUR', name: 'Surpresseur sanitaire 3 pompes', kind: 'EQUIPEMENT', crit: 'IMPORTANT', meter: 'HEURES', currentMeter: 3210, status: 'EN_SERVICE' },
    { s: siege, lot: 'PLB', zone: 'Sous-sol 2', type: 'REL', name: 'Pompe de relevage eaux usées', kind: 'EQUIPEMENT', crit: 'IMPORTANT', meter: 'HEURES', currentMeter: 1455, status: 'EN_SERVICE' },
    { s: siege, lot: 'ELC', zone: 'Sous-sol 1 — Local TGBT', type: 'TGB', name: 'TGBT principal', kind: 'INSTALLATION', crit: 'CRITIQUE', meter: 'NONE', status: 'EN_SERVICE' },
    { s: siege, lot: 'ELC', zone: 'N3 — Datacenter', type: 'OND', name: 'Onduleur salle serveurs 20 kVA', kind: 'EQUIPEMENT', crit: 'CRITIQUE', meter: 'NONE', status: 'EN_SERVICE' },
    { s: siege, lot: 'GE', zone: 'Local extérieur', type: 'GRP', name: 'Groupe électrogène 250 kVA', kind: 'EQUIPEMENT', crit: 'CRITIQUE', meter: 'HEURES', currentMeter: 642, acq: 45_000_000, status: 'EN_SERVICE' },
    { s: ccm, lot: 'ASC', zone: 'Galerie N1', type: 'ESC', name: 'Escalator galerie niveau 1', kind: 'INSTALLATION', crit: 'IMPORTANT', meter: 'NONE', status: 'EN_SERVICE' },
    { s: ccm, lot: 'NET', zone: 'Toiture technique', type: 'CTA', name: 'CTA ventilation zone commerciale', kind: 'EQUIPEMENT', crit: 'STANDARD', meter: 'HEURES', currentMeter: 8940, status: 'EN_SERVICE' },
    { s: res, lot: 'PLB', zone: 'Toiture', type: 'BAL', name: 'Ballon ECS 1500 L', kind: 'EQUIPEMENT', crit: 'STANDARD', meter: 'NONE', status: 'EN_SERVICE' },
  ];
  let eqSeq: Record<string, number> = {};
  const eq: any[] = [];
  for (const d of eqDefs) {
    const key = `${d.s.code}-${d.lot}`;
    eqSeq[key] = (eqSeq[key] ?? 0) + 1;
    const assetTag = `${d.s.code}-${d.lot}-${d.zone.split(/[ —-]/)[0].slice(0, 3).toUpperCase()}-${d.type}-${String(eqSeq[key]).padStart(2, '0')}`;
    eq.push(
      await prisma.equipment.upsert({
        where: { assetTag },
        update: { status: d.status, currentMeter: (d as any).currentMeter ?? 0 },
        create: {
          assetTag,
          qrPayload: `GMAO:${assetTag}`,
          name: d.name,
          kind: d.kind,
          lotId: lots[d.lot].id,
          zone: d.zone,
          criticality: d.crit,
          meterKind: d.meter,
          currentMeter: (d as any).currentMeter ?? 0,
          status: d.status,
          acquisitionCost: (d as any).acq ?? null,
          acquisitionDate: daysAgo(1200),
        },
      }),
    );
  }
  const byTag = (frag: string) => eq.find((e) => e.assetTag.includes(frag));
  const ascA = byTag('-ASC-NOY-CAB'), ascB = byTag('-ASC-NOY-MCH'), ssiCen = byTag('-SSI-RDC-CEN'),
    ssiDes = byTag('-SSI-TOI-DES'), surp = byTag('-PLB-SOU-SUR'), tgbt = byTag('-ELC-SOU-TGB'),
    ge = byTag('-GE-LOC-GRP'), cta = byTag('-NET-TOI-CTA');

  // affectations projet
  await prisma.equipmentAssignment.deleteMany();
  await prisma.equipmentAssignment.createMany({
    data: eq.map((e) => ({
      equipmentId: e.id,
      siteId: e.assetTag.startsWith('IMM-ALM-01') ? siege.id : e.assetTag.startsWith('CCM-SPZ-02') ? ccm.id : res.id,
      fromDate: daysAgo(150),
    })),
  });

  // ── plans préventifs (fréquences réglementaires & contractuelles) ──
  await prisma.preventivePlan.deleteMany();
  await prisma.preventivePlan.createMany({
    data: [
      { equipmentId: ascA.id, label: 'Visite mensuelle ascenseur', trigger: 'CALENDAIRE', intervalValue: 30, nextDueDate: daysAgo(-6), isRegulatory: true },
      { equipmentId: ascA.id, label: 'Contrôle technique quinquennal', trigger: 'CALENDAIRE', intervalValue: 1825, nextDueDate: daysAgo(-110), isRegulatory: true },
      { equipmentId: ascB.id, label: 'Visite mensuelle monte-charge', trigger: 'CALENDAIRE', intervalValue: 30, nextDueDate: daysAgo(-4), isRegulatory: true },
      { equipmentId: ssiCen.id, label: 'Essai trimestriel SSI + BAES', trigger: 'CALENDAIRE', intervalValue: 90, nextDueDate: daysAgo(-12), isRegulatory: true },
      { equipmentId: surp.id, label: 'Contrôle mensuel pressions / étanchéité', trigger: 'CALENDAIRE', intervalValue: 30, nextDueDate: daysAgo(-3) },
      { equipmentId: ge.id, label: 'Essai hebdomadaire à vide', trigger: 'CALENDAIRE', intervalValue: 7, nextDueDate: daysAgo(-1) },
      { equipmentId: ge.id, label: 'Vidange 250 h', trigger: 'HEURES', intervalValue: 250, lastDoneMeter: 500, nextDueMeter: 750 },
      { equipmentId: tgbt.id, label: 'Thermographie infrarouge semestrielle', trigger: 'CALENDAIRE', intervalValue: 180, nextDueDate: daysAgo(-40), isRegulatory: true },
      { equipmentId: cta.id, label: 'Remplacement filtres trimestriel', trigger: 'CALENDAIRE', intervalValue: 90, nextDueDate: daysAgo(5) },
    ],
  });

  // ── magasin (pièces & consommables) ──
  const partData = [
    { sku: 'FLT-CTA-G4', label: 'Filtre CTA G4 592×592×48', category: 'Filtration', unitCost: 12_000, reorderPoint: 8, reorderQty: 24, onHand: 5 },
    { sku: 'COU-ASC-13', label: 'Courroie de traction ascenseur 13 mm', category: 'Ascenseurs', unitCost: 45_000, reorderPoint: 2, reorderQty: 6, onHand: 1 },
    { sku: 'BAT-BAES-6V', label: 'Batterie BAES 6V 4Ah', category: 'Sécurité incendie', unitCost: 8_500, reorderPoint: 20, reorderQty: 60, onHand: 12 },
    { sku: 'HUI-GE-15W40', label: 'Huile groupe électrogène 15W40 (bidon 20 L)', category: 'Lubrifiant', unitCost: 32_000, reorderPoint: 3, reorderQty: 8, onHand: 4 },
    { sku: 'JOI-SUR-DN50', label: 'Jeu de joints surpresseur DN50', category: 'Plomberie', unitCost: 15_000, reorderPoint: 4, reorderQty: 12, onHand: 6 },
  ];
  for (const p of partData) {
    const part = await prisma.part.upsert({
      where: { sku: p.sku },
      update: { unitCost: p.unitCost, reorderPoint: p.reorderPoint, reorderQty: p.reorderQty },
      create: { sku: p.sku, label: p.label, category: p.category, unitCost: p.unitCost, reorderPoint: p.reorderPoint, reorderQty: p.reorderQty },
    });
    await prisma.stockItem.upsert({ where: { partId: part.id }, update: { onHand: p.onHand }, create: { partId: part.id, onHand: p.onHand } });
  }

  // ── DI / OS couvrant tout le workflow ──
  let seq = 0;
  const ref = () => `DI-${new Date().getFullYear()}-${String(++seq).padStart(6, '0')}`;
  const cid = () => `seed-${crypto.randomUUID()}`;
  const siteOf = (e: any) =>
    e.assetTag.startsWith('IMM-ALM-01') ? siege.id : e.assetTag.startsWith('CCM-SPZ-02') ? ccm.id : res.id;

  async function makeTicket(o: {
    status: string; type?: string; urgency?: string; title: string;
    eq?: any; site?: string; reporter?: string; ageDays: number; events: string[];
    dueDate?: Date;
    intervention?: { tech?: string; provider?: string; scheduledInDays?: number; laborHours?: number; done?: boolean };
    costs?: { kind: string; label: string; amount: number }[]; signed?: boolean;
  }) {
    const siteId = o.site ?? (o.eq ? siteOf(o.eq) : siege.id);
    const lotId = o.eq?.lotId ?? null;
    const t = await prisma.ticket.create({
      data: {
        reference: ref(), clientId: cid(),
        type: (o.type ?? 'PANNE_CRITIQUE') as any,
        urgency: (o.urgency ?? 'N2_MAJEUR') as any,
        status: o.status as any,
        title: o.title,
        description: 'Signalement enregistré via le formulaire de demande d’intervention.',
        siteId, equipmentId: o.eq?.id ?? null, lotId,
        reporterId: o.reporter ?? chef.id,
        dueDate: o.dueDate ?? null,
        createdAtField: daysAgo(o.ageDays),
        qualifiedAt: o.events.includes('QUALIFIE') ? daysAgo(o.ageDays - 0.5) : null,
        plannedAt: o.events.includes('PLANIFIE') ? daysAgo(o.ageDays - 1) : null,
        startedAt: o.events.includes('EN_COURS') ? daysAgo(o.ageDays - 1.5) : null,
        workDoneAt: o.events.includes('TRAVAUX_TERMINES') ? daysAgo(o.ageDays - 2) : null,
        validatedAt: o.events.includes('VALIDE_TERRAIN') ? daysAgo(o.ageDays - 2.2) : null,
        closedAt: o.events.includes('CLOTURE') ? daysAgo(o.ageDays - 2.5) : null,
      },
    });

    let prev: string | null = null;
    for (const [i, s] of ['EN_ATTENTE', ...o.events].entries()) {
      await prisma.ticketEvent.create({
        data: { ticketId: t.id, fromStatus: prev as any, toStatus: s as any, actorId: i === 0 ? (o.reporter ?? chef.id) : respo.id, createdAt: daysAgo(o.ageDays - i * 0.4), origin: i === 0 ? 'API' : 'API' },
      });
      prev = s;
    }

    if (o.intervention) {
      const iv = o.intervention;
      await prisma.intervention.create({
        data: {
          ticketId: t.id,
          assigneeKind: iv.provider ? 'PROVIDER' : 'MECHANIC',
          mechanicId: iv.provider ? null : iv.tech ?? tech.id,
          providerId: iv.provider ?? null,
          scheduledFor: iv.scheduledInDays != null ? daysAgo(-iv.scheduledInDays) : daysAgo(o.ageDays - 1),
          startedAt: iv.done ? daysAgo(o.ageDays - 1.5) : null,
          endedAt: iv.done ? daysAgo(o.ageDays - 2) : null,
          laborHours: iv.laborHours ?? null,
          laborRate: iv.provider ? null : 12_000,
          report: iv.done ? 'Intervention réalisée. Installation remise en service, carnet de santé mis à jour.' : null,
        },
      });
    }

    for (const c of o.costs ?? []) {
      await prisma.costLine.create({
        data: {
          ticketId: t.id, siteId, equipmentId: o.eq?.id ?? null, lotId,
          kind: c.kind as any, label: c.label, quantity: 1, unitAmount: c.amount, amount: c.amount,
          locked: o.status === 'CLOTURE', incurredAt: hoursAgo(6 + seq * 4),
        },
      });
    }

    if (o.signed) {
      await prisma.ticketSignature.create({
        data: { ticketId: t.id, signerId: o.reporter ?? chef.id, signerName: 'Amadou Diallo', signatureKey: `signatures/${t.id}.png`, signedAt: daysAgo(o.ageDays - 2.2) },
      });
    }
    return t;
  }

  const CUR = 'PANNE_CRITIQUE', PREV = 'MAINTENANCE_PREVENTIVE', PIECE = 'DEMANDE_PIECE';

  // curatives
  await makeTicket({ status: 'EN_ATTENTE', urgency: 'N1_BLOQUANT', title: 'Ascenseur B bloqué entre le 2ᵉ et le 3ᵉ niveau', eq: ascB, ageDays: 0.2, events: [] });
  await makeTicket({ status: 'QUALIFIE', urgency: 'N2_MAJEUR', title: 'Détecteur SSI en défaut — zone bureaux N2', eq: ssiCen, ageDays: 1, events: ['QUALIFIE'] });
  await makeTicket({
    status: 'PLANIFIE', urgency: 'N1_BLOQUANT', title: 'Absence de pression d’eau aux étages supérieurs', eq: surp, ageDays: 1.5,
    events: ['QUALIFIE', 'PLANIFIE'], intervention: { tech: tech.id, scheduledInDays: 1 },
  });
  await makeTicket({
    status: 'VALIDE_TERRAIN', urgency: 'N1_BLOQUANT', title: 'Infiltration d’eau dans le local TGBT', eq: tgbt, ageDays: 7,
    events: ['QUALIFIE', 'PLANIFIE', 'EN_COURS', 'TRAVAUX_TERMINES', 'VALIDE_TERRAIN'], signed: true,
    intervention: { provider: elcProv.id, laborHours: 5, done: true },
    costs: [
      { kind: 'FACTURE_EXTERNE', label: 'Reprise étanchéité + nettoyage local TGBT', amount: 240_000 },
      { kind: 'DEPLACEMENT', label: 'Forfait déplacement prestataire', amount: 25_000 },
    ],
  });
  await makeTicket({
    status: 'CLOTURE', urgency: 'N2_MAJEUR', type: CUR, title: 'Remplacement filtres CTA encrassés (perte de débit)', eq: cta, ageDays: 30,
    events: ['QUALIFIE', 'PLANIFIE', 'EN_COURS', 'TRAVAUX_TERMINES', 'VALIDE_TERRAIN', 'CLOTURE'], signed: true,
    intervention: { tech: tech2.id, laborHours: 2, done: true },
    costs: [
      { kind: 'MAIN_OEUVRE', label: 'Main d’œuvre (2 h)', amount: 24_000 },
      { kind: 'PIECE', label: 'Filtres CTA G4 ×4', amount: 48_000 },
    ],
  });

  // préventifs — avec échéance (dueDate) → alimente le TRPP
  await makeTicket({
    status: 'EN_COURS', urgency: 'N3_MINEUR', type: PREV, title: 'Essai hebdomadaire groupe électrogène (à vide)', eq: ge, ageDays: 2,
    events: ['QUALIFIE', 'PLANIFIE', 'EN_COURS'], dueDate: daysAgo(1), intervention: { tech: tech.id, laborHours: 1 },
  });
  await makeTicket({
    status: 'VALIDE_TERRAIN', urgency: 'N2_MAJEUR', type: PREV, title: 'Visite mensuelle ascenseur A', eq: ascA, ageDays: 4,
    events: ['QUALIFIE', 'PLANIFIE', 'EN_COURS', 'TRAVAUX_TERMINES', 'VALIDE_TERRAIN'], dueDate: daysAgo(1), signed: true,
    intervention: { provider: ascProv.id, laborHours: 2, done: true },
    costs: [{ kind: 'FACTURE_EXTERNE', label: 'Visite contractuelle Otis — ascenseur A', amount: 90_000 }],
  });
  await makeTicket({
    status: 'CLOTURE', urgency: 'N2_MAJEUR', type: PREV, title: 'Essai trimestriel SSI + test autonomie BAES', eq: ssiCen, ageDays: 20,
    events: ['QUALIFIE', 'PLANIFIE', 'EN_COURS', 'TRAVAUX_TERMINES', 'VALIDE_TERRAIN', 'CLOTURE'], signed: true,
    dueDate: daysAgo(22), // clôturé à J-17.5 → EN RETARD
    intervention: { provider: ssiProv.id, laborHours: 4, done: true },
    costs: [
      { kind: 'FACTURE_EXTERNE', label: 'Contrôle trimestriel SICLI', amount: 40_000 },
      { kind: 'PIECE', label: 'Batteries BAES 6V ×4', amount: 34_000 },
    ],
  });
  await makeTicket({
    status: 'CLOTURE', urgency: 'N3_MINEUR', type: PREV, title: 'Thermographie infrarouge TGBT', eq: tgbt, ageDays: 35,
    events: ['QUALIFIE', 'PLANIFIE', 'EN_COURS', 'TRAVAUX_TERMINES', 'VALIDE_TERRAIN', 'CLOTURE'], signed: true,
    dueDate: daysAgo(31), // clôturé à J-32.5, avant échéance → dans les temps
    intervention: { provider: elcProv.id, laborHours: 3, done: true },
    costs: [{ kind: 'FACTURE_EXTERNE', label: 'Rapport thermographie Schneider', amount: 150_000 }],
  });
  await makeTicket({
    status: 'CLOTURE', urgency: 'N3_MINEUR', type: PREV, title: 'Contrôle mensuel surpresseur (pressions/étanchéité)', eq: surp, ageDays: 12,
    events: ['QUALIFIE', 'PLANIFIE', 'EN_COURS', 'TRAVAUX_TERMINES', 'VALIDE_TERRAIN', 'CLOTURE'],
    dueDate: daysAgo(8), // clôturé à J-9.5, avant échéance → dans les temps
    intervention: { tech: tech.id, laborHours: 1, done: true },
    costs: [{ kind: 'MAIN_OEUVRE', label: 'Main d’œuvre (1 h)', amount: 12_000 }],
  });
  await makeTicket({
    status: 'CLOTURE', urgency: 'N3_MINEUR', type: PREV, title: 'Vidange 250 h — groupe électrogène', eq: ge, ageDays: 25,
    events: ['QUALIFIE', 'PLANIFIE', 'EN_COURS', 'TRAVAUX_TERMINES', 'VALIDE_TERRAIN', 'CLOTURE'],
    dueDate: daysAgo(21), // clôturé à J-22.5, avant échéance → dans les temps
    intervention: { tech: tech2.id, laborHours: 2, done: true },
    costs: [
      { kind: 'MAIN_OEUVRE', label: 'Main d’œuvre (2 h)', amount: 24_000 },
      { kind: 'PIECE', label: 'Huile 15W40 20 L + filtres', amount: 41_000 },
    ],
  });
  await makeTicket({
    status: 'CLOTURE', urgency: 'N3_MINEUR', type: PREV, title: 'Visite mensuelle monte-charge (ascenseur B)', eq: ascB, ageDays: 40,
    events: ['QUALIFIE', 'PLANIFIE', 'EN_COURS', 'TRAVAUX_TERMINES', 'VALIDE_TERRAIN', 'CLOTURE'],
    dueDate: daysAgo(36), // clôturé à J-37.5, avant échéance → dans les temps
    intervention: { provider: ascProv.id, laborHours: 2, done: true },
    costs: [{ kind: 'FACTURE_EXTERNE', label: 'Visite contractuelle Otis — ascenseur B', amount: 90_000 }],
  });

  // demande de pièce
  await makeTicket({
    status: 'PLANIFIE', urgency: 'N3_MINEUR', type: PIECE, title: 'Demande de batteries BAES pour le niveau 2', site: siege.id, reporter: chef2.id, ageDays: 1.5,
    events: ['QUALIFIE', 'PLANIFIE'], intervention: { tech: tech2.id, scheduledInDays: 3 },
  });

  const counts = {
    lots: await prisma.technicalLot.count(),
    projets: await prisma.site.count(),
    actifs: await prisma.equipment.count(),
    di: await prisma.ticket.count(),
    preventifsAEcheance: await prisma.ticket.count({ where: { type: 'MAINTENANCE_PREVENTIVE', dueDate: { not: null } } }),
    lignesDeCout: await prisma.costLine.count(),
  };
  console.log('Seed OK', counts);
  console.log('Comptes (mdp gmao1234) : admin@gmao.local (ADMIN) · parc@gmao.local (PARK_MANAGER) · chef@gmao.local (FIELD_MANAGER)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
