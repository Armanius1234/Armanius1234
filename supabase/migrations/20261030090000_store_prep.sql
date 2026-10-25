-- PL8 — Milestone 6: store launch preparation
--
--   * German district codes: plates must use a real Unterscheidungszeichen
--   * edit post captions
--   * delete (hide) a conversation for yourself
--   * admins: list of suspended accounts, lift a suspension in the app
--   * sign in with Apple / Google: 18+ and consent are collected in the app and
--     enforced here before a profile can be created
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- German district codes
-- Sources: Senatsverwaltung für Wirtschaft, Technologie und Forschung Berlin
-- (CC BY 3.0, via npm german-license-plate-prefixes 2.18.0) combined with npm
-- kennzeichen 0.1.6 (MIT). Same list as src/shared/plateDistricts.ts.
-- To add a new code later:  insert into private.de_districts values ('XYZ');
-- -----------------------------------------------------------------------------
create table private.de_districts (
  code text primary key check (code ~ '^[A-ZÄÖÜ]{1,3}$')
);

insert into private.de_districts (code) values
  ('A'), ('AA'), ('AB'), ('ABG'), ('ABI'), ('AC'), ('AE'), ('AH'), ('AIB'), ('AIC'), ('AK'), ('ALF'), ('ALZ'), ('AM'),
  ('AN'), ('ANA'), ('ANG'), ('ANK'), ('AP'), ('APD'), ('ARN'), ('ART'), ('AS'), ('ASL'), ('ASZ'), ('AT'), ('AU'), ('AUR'),
  ('AW'), ('AZ'), ('AZE'), ('AÖ'), ('B'), ('BA'), ('BAD'), ('BAR'), ('BB'), ('BBG'), ('BBL'), ('BC'), ('BCH'), ('BD'),
  ('BE'), ('BED'), ('BER'), ('BF'), ('BGD'), ('BGL'), ('BH'), ('BI'), ('BID'), ('BIN'), ('BIR'), ('BIT'), ('BIW'), ('BK'),
  ('BKS'), ('BL'), ('BLB'), ('BLK'), ('BM'), ('BN'), ('BNA'), ('BO'), ('BOG'), ('BOH'), ('BOR'), ('BOT'), ('BP'), ('BRA'),
  ('BRB'), ('BRG'), ('BRK'), ('BRL'), ('BRV'), ('BS'), ('BSB'), ('BSK'), ('BT'), ('BTF'), ('BUL'), ('BW'), ('BWL'), ('BYL'),
  ('BZ'), ('BÖ'), ('BÜD'), ('BÜR'), ('BÜS'), ('BÜZ'), ('C'), ('CA'), ('CAS'), ('CB'), ('CE'), ('CHA'), ('CLP'), ('CLZ'),
  ('CO'), ('COC'), ('COE'), ('CR'), ('CUX'), ('CW'), ('D'), ('DA'), ('DAH'), ('DAN'), ('DAU'), ('DBR'), ('DD'), ('DE'),
  ('DEG'), ('DEL'), ('DGF'), ('DH'), ('DI'), ('DIL'), ('DIN'), ('DIZ'), ('DKB'), ('DL'), ('DLG'), ('DM'), ('DN'), ('DO'),
  ('DON'), ('DU'), ('DUD'), ('DW'), ('DZ'), ('DÜW'), ('E'), ('EA'), ('EB'), ('EBE'), ('EBN'), ('EBS'), ('ECK'), ('ED'),
  ('EE'), ('EF'), ('EG'), ('EH'), ('EI'), ('EIC'), ('EIL'), ('EIN'), ('EIS'), ('EL'), ('EM'), ('EMD'), ('EMS'), ('EN'),
  ('ER'), ('ERB'), ('ERH'), ('ERK'), ('ERZ'), ('ES'), ('ESB'), ('ESW'), ('EU'), ('EW'), ('F'), ('FB'), ('FD'), ('FDB'),
  ('FDS'), ('FEU'), ('FF'), ('FFB'), ('FG'), ('FI'), ('FKB'), ('FL'), ('FLÖ'), ('FN'), ('FO'), ('FOR'), ('FR'), ('FRG'),
  ('FRI'), ('FRW'), ('FS'), ('FT'), ('FTL'), ('FW'), ('FZ'), ('FÜ'), ('FÜS'), ('G'), ('GA'), ('GAN'), ('GAP'), ('GC'),
  ('GD'), ('GDB'), ('GE'), ('GEL'), ('GEO'), ('GER'), ('GF'), ('GG'), ('GHA'), ('GHC'), ('GI'), ('GK'), ('GL'), ('GLA'),
  ('GM'), ('GMN'), ('GN'), ('GNT'), ('GOA'), ('GOH'), ('GP'), ('GR'), ('GRA'), ('GRH'), ('GRI'), ('GRM'), ('GRZ'), ('GS'),
  ('GT'), ('GTH'), ('GUB'), ('GUN'), ('GV'), ('GVM'), ('GW'), ('GZ'), ('GÖ'), ('GÜ'), ('H'), ('HA'), ('HAB'), ('HAL'),
  ('HAM'), ('HAS'), ('HB'), ('HBN'), ('HBS'), ('HC'), ('HCH'), ('HD'), ('HDH'), ('HDL'), ('HE'), ('HEB'), ('HEF'), ('HEI'),
  ('HEL'), ('HER'), ('HET'), ('HF'), ('HG'), ('HGN'), ('HGW'), ('HH'), ('HHM'), ('HI'), ('HIG'), ('HIP'), ('HK'), ('HL'),
  ('HM'), ('HMÜ'), ('HN'), ('HO'), ('HOG'), ('HOH'), ('HOL'), ('HOM'), ('HOR'), ('HOT'), ('HP'), ('HR'), ('HRO'), ('HS'),
  ('HSK'), ('HST'), ('HU'), ('HV'), ('HVL'), ('HWI'), ('HX'), ('HY'), ('HZ'), ('HÖS'), ('IGB'), ('IK'), ('IL'), ('ILL'),
  ('IN'), ('IZ'), ('J'), ('JE'), ('JL'), ('JÜL'), ('K'), ('KA'), ('KB'), ('KC'), ('KE'), ('KEH'), ('KEL'), ('KEM'),
  ('KF'), ('KG'), ('KH'), ('KI'), ('KIB'), ('KK'), ('KL'), ('KLE'), ('KLZ'), ('KM'), ('KN'), ('KO'), ('KR'), ('KRU'),
  ('KS'), ('KT'), ('KU'), ('KUS'), ('KW'), ('KY'), ('KYF'), ('KÖN'), ('KÖT'), ('KÖZ'), ('KÜN'), ('L'), ('LA'), ('LAN'),
  ('LAU'), ('LB'), ('LBS'), ('LBZ'), ('LC'), ('LD'), ('LDK'), ('LDS'), ('LEO'), ('LER'), ('LEV'), ('LF'), ('LG'), ('LH'),
  ('LI'), ('LIB'), ('LIF'), ('LIP'), ('LL'), ('LM'), ('LN'), ('LOS'), ('LP'), ('LR'), ('LRO'), ('LSA'), ('LSN'), ('LSZ'),
  ('LU'), ('LUP'), ('LWL'), ('LÖ'), ('LÖB'), ('LÜN'), ('M'), ('MA'), ('MAB'), ('MAI'), ('MAK'), ('MAL'), ('MB'), ('MC'),
  ('MD'), ('ME'), ('MED'), ('MEG'), ('MEI'), ('MEK'), ('MEL'), ('MER'), ('MET'), ('MG'), ('MGH'), ('MGN'), ('MH'), ('MHL'),
  ('MI'), ('MIL'), ('MK'), ('MKK'), ('ML'), ('MM'), ('MN'), ('MO'), ('MOD'), ('MOL'), ('MON'), ('MOS'), ('MQ'), ('MR'),
  ('MS'), ('MSE'), ('MSH'), ('MSP'), ('MST'), ('MTK'), ('MTL'), ('MUC'), ('MVL'), ('MW'), ('MY'), ('MYK'), ('MZ'), ('MZG'),
  ('MÜ'), ('MÜB'), ('MÜL'), ('MÜR'), ('N'), ('NAB'), ('NAI'), ('NAU'), ('NB'), ('ND'), ('NDH'), ('NE'), ('NEA'), ('NEB'),
  ('NEC'), ('NEN'), ('NES'), ('NEU'), ('NEW'), ('NF'), ('NH'), ('NI'), ('NK'), ('NL'), ('NM'), ('NMB'), ('NMS'), ('NOH'),
  ('NOL'), ('NOM'), ('NOR'), ('NP'), ('NR'), ('NRW'), ('NT'), ('NU'), ('NVP'), ('NW'), ('NWM'), ('NY'), ('NZ'), ('NÖ'),
  ('OA'), ('OAL'), ('OB'), ('OBB'), ('OBG'), ('OC'), ('OCH'), ('OD'), ('OE'), ('OF'), ('OG'), ('OH'), ('OHA'), ('OHV'),
  ('OHZ'), ('OK'), ('OL'), ('OP'), ('OPR'), ('OS'), ('OSL'), ('OTW'), ('OVI'), ('OVL'), ('OVP'), ('OZ'), ('P'), ('PA'),
  ('PAF'), ('PAN'), ('PAR'), ('PB'), ('PCH'), ('PE'), ('PEG'), ('PF'), ('PI'), ('PIR'), ('PL'), ('PLÖ'), ('PM'), ('PN'),
  ('PR'), ('PRÜ'), ('PS'), ('PW'), ('PZ'), ('QFT'), ('QLB'), ('R'), ('RA'), ('RC'), ('RD'), ('RDG'), ('RE'), ('REG'),
  ('REH'), ('REI'), ('RG'), ('RH'), ('RI'), ('RID'), ('RIE'), ('RL'), ('RM'), ('RN'), ('RO'), ('ROD'), ('ROF'), ('ROK'),
  ('ROL'), ('ROS'), ('ROT'), ('ROW'), ('RP'), ('RPL'), ('RS'), ('RSL'), ('RT'), ('RU'), ('RV'), ('RW'), ('RZ'), ('RÜD'),
  ('RÜG'), ('S'), ('SAB'), ('SAD'), ('SAL'), ('SAN'), ('SAW'), ('SB'), ('SBG'), ('SBK'), ('SC'), ('SCZ'), ('SDH'), ('SDL'),
  ('SDT'), ('SE'), ('SEB'), ('SEE'), ('SEF'), ('SEL'), ('SFB'), ('SFT'), ('SG'), ('SGH'), ('SH'), ('SHA'), ('SHG'), ('SHK'),
  ('SHL'), ('SI'), ('SIG'), ('SIH'), ('SIM'), ('SK'), ('SL'), ('SLE'), ('SLF'), ('SLG'), ('SLK'), ('SLN'), ('SLS'), ('SLZ'),
  ('SLÜ'), ('SM'), ('SMÜ'), ('SN'), ('SO'), ('SOB'), ('SOG'), ('SOK'), ('SON'), ('SP'), ('SPB'), ('SPN'), ('SR'), ('SRB'),
  ('SRO'), ('ST'), ('STA'), ('STB'), ('STD'), ('STE'), ('STL'), ('STO'), ('SU'), ('SUL'), ('SW'), ('SWA'), ('SY'), ('SZ'),
  ('SZB'), ('SÄK'), ('SÖM'), ('SÜW'), ('TBB'), ('TDO'), ('TE'), ('TET'), ('TF'), ('TG'), ('THL'), ('THW'), ('TIR'), ('TO'),
  ('TP'), ('TR'), ('TS'), ('TT'), ('TUT'), ('TÖL'), ('TÜ'), ('UE'), ('UEM'), ('UER'), ('UFF'), ('UH'), ('UL'), ('UM'),
  ('UN'), ('USI'), ('V'), ('VAI'), ('VB'), ('VEC'), ('VER'), ('VG'), ('VIB'), ('VIE'), ('VIT'), ('VK'), ('VOH'), ('VR'),
  ('VS'), ('W'), ('WA'), ('WAF'), ('WAK'), ('WAN'), ('WAR'), ('WAT'), ('WB'), ('WBS'), ('WDA'), ('WE'), ('WEL'), ('WEN'),
  ('WER'), ('WES'), ('WF'), ('WG'), ('WHV'), ('WI'), ('WIL'), ('WIN'), ('WIS'), ('WIT'), ('WIV'), ('WIZ'), ('WK'), ('WL'),
  ('WLG'), ('WM'), ('WMS'), ('WN'), ('WND'), ('WO'), ('WOB'), ('WOH'), ('WOL'), ('WOR'), ('WOS'), ('WR'), ('WRN'), ('WS'),
  ('WSF'), ('WST'), ('WSW'), ('WT'), ('WTL'), ('WTM'), ('WUG'), ('WUN'), ('WUR'), ('WW'), ('WZ'), ('WZL'), ('WÜ'), ('WÜM'),
  ('X'), ('Y'), ('Z'), ('ZE'), ('ZEL'), ('ZI'), ('ZIG'), ('ZP'), ('ZR'), ('ZW'), ('ZZ'), ('ÖHR'), ('ÜB');
revoke all on private.de_districts from public, anon, authenticated;

create function private.is_de_district(p_code text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from private.de_districts d where d.code = p_code);
$$;
revoke execute on function private.is_de_district(text) from public, anon;
grant execute on function private.is_de_district(text) to authenticated;

-- Same rules as before, plus: the district must exist. Unknown districts give
-- null, which claim_plate / search_plate already reject as an invalid plate.
-- Keep in sync with src/shared/plate.ts (shared test vectors).
create or replace function private.normalize_plate_de(p_district text, p_letters text, p_digits text, p_suffix text)
returns text
language plpgsql stable set search_path = ''
as $$
declare
  d text := upper(translate(btrim(coalesce(p_district, '')), 'äöü', 'ÄÖÜ'));
  l text := upper(btrim(coalesce(p_letters, '')));
  n text := btrim(coalesce(p_digits, ''));
  s text := upper(btrim(coalesce(p_suffix, '')));
begin
  if d !~ '^[A-ZÄÖÜ]{1,3}$' or l !~ '^[A-Z]{1,2}$' or n !~ '^[1-9][0-9]{0,3}$' or s !~ '^[EH]?$' then
    return null;
  end if;
  -- German plates have at most 8 characters including the E/H suffix.
  if char_length(d || l || n || s) > 8 then
    return null;
  end if;
  if not private.is_de_district(d) then
    return null;
  end if;
  return d || '-' || l || '-' || n || s;
end;
$$;

-- -----------------------------------------------------------------------------
-- Sign in with Apple / Google
--
-- Email sign-ups still send 18+ and consent with the sign-up (checked below).
-- Apple / Google create the login first; the app then asks for 18+ and consent
-- (record_consent). Until that is recorded the account is treated as blocked by
-- everyone (is_blocked_between), so it cannot see or contact anybody, and it
-- cannot create a profile (profiles_insert_own already requires consent).
-- The provider is set by Supabase Auth before the user row is inserted.
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  social boolean := coalesce(new.raw_app_meta_data ->> 'provider', '') in ('apple', 'google');
  consent_given boolean;
begin
  consent_given := (meta -> 'age_confirmed') = 'true'::jsonb
                   and coalesce(meta ->> 'terms_version', '') <> ''
                   and coalesce(meta ->> 'privacy_version', '') <> '';

  if not social then
    if (meta -> 'age_confirmed') is distinct from 'true'::jsonb then
      raise exception 'PL8_AGE_CONFIRMATION_REQUIRED' using errcode = 'P0001';
    end if;
    if not consent_given then
      raise exception 'PL8_CONSENT_REQUIRED' using errcode = 'P0001';
    end if;
  end if;

  if consent_given then
    insert into private.user_consents (user_id, age_confirmed_at, terms_version, privacy_version)
    values (new.id, now(), meta ->> 'terms_version', meta ->> 'privacy_version');
  end if;

  insert into public.user_settings (user_id, locale)
  values (
    new.id,
    case when meta ->> 'locale' in ('de', 'en') then meta ->> 'locale' else 'de' end
  );

  return new;
end;
$$;
revoke execute on function private.handle_new_user() from public, anon, authenticated;

-- Has the signed-in user confirmed 18+ and accepted the terms?
create function public.my_consent()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.has_consent(auth.uid());
$$;

-- 18+ and consent for Apple / Google sign-ups (no-op if already recorded).
create function public.record_consent(
  p_age_confirmed boolean,
  p_terms_version text,
  p_privacy_version text,
  p_locale text default null
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'PL8_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_age_confirmed is not true then
    raise exception 'PL8_AGE_CONFIRMATION_REQUIRED' using errcode = 'P0001';
  end if;
  if char_length(coalesce(btrim(p_terms_version), '')) not between 1 and 20
     or char_length(coalesce(btrim(p_privacy_version), '')) not between 1 and 20 then
    raise exception 'PL8_CONSENT_REQUIRED' using errcode = 'P0001';
  end if;

  insert into private.user_consents (user_id, age_confirmed_at, terms_version, privacy_version)
  values (uid, now(), btrim(p_terms_version), btrim(p_privacy_version))
  on conflict (user_id) do nothing;
  if not found then
    return; -- already recorded: change nothing
  end if;

  if p_locale in ('de', 'en') then
    update public.user_settings s set locale = p_locale where s.user_id = uid;
  end if;
end;
$$;

-- Blocked = an explicit block in either direction, or one side has not given
-- consent yet (see above). A deleted user (null) has no consent check.
create or replace function private.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (a is not null and not private.has_consent(a))
      or (b is not null and not private.has_consent(b))
      or exists (
        select 1
        from public.blocks bl
        where (bl.blocker_id = a and bl.blocked_id = b)
           or (bl.blocker_id = b and bl.blocked_id = a)
      );
$$;

-- -----------------------------------------------------------------------------
-- Delete a conversation for yourself
-- Hides the chat and every earlier message for you only. A new message brings
-- the chat back, with only the new messages. The other person keeps everything.
-- Stored privately, so the other person cannot see that you hid it.
-- -----------------------------------------------------------------------------
create table private.hidden_conversations (
  user_id         uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  hidden_at       timestamptz not null default clock_timestamp(),
  primary key (user_id, conversation_id)
);
revoke all on private.hidden_conversations from public, anon, authenticated;

create function private.hidden_before(uid uuid, cid uuid)
returns timestamptz
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select h.hidden_at from private.hidden_conversations h where h.user_id = uid and h.conversation_id = cid),
    '-infinity'::timestamptz);
$$;
revoke execute on function private.hidden_before(uuid, uuid) from public, anon;
grant execute on function private.hidden_before(uuid, uuid) to authenticated;

drop policy messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (
    private.can_access_conversation((select auth.uid()), conversation_id)
    and created_at > private.hidden_before((select auth.uid()), conversation_id)
  );

create function public.hide_conversation(p_conversation uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  t timestamptz := clock_timestamp();
begin
  if not exists (select 1 from public.conversation_participants p
                 where p.conversation_id = p_conversation and p.user_id = uid) then
    raise exception 'PL8_NOT_FOUND' using errcode = '42501';
  end if;
  insert into private.hidden_conversations (user_id, conversation_id, hidden_at)
  values (uid, p_conversation, t)
  on conflict (user_id, conversation_id) do update set hidden_at = excluded.hidden_at;
  -- Everything hidden counts as read.
  update public.conversation_participants p set last_read_at = greatest(p.last_read_at, t)
   where p.conversation_id = p_conversation and p.user_id = uid;
end;
$$;

create or replace function public.my_conversations()
returns table (
  conversation_id     uuid,
  status              text,
  is_request_for_me   boolean,
  other_id            uuid,
  other_username      text,
  other_display_name  text,
  other_avatar_path   text,
  last_message        text,
  last_message_mine   boolean,
  last_message_at     timestamptz,
  unread_count        integer
)
language sql stable security definer set search_path = ''
as $$
  select c.id,
         c.status::text,
         (c.status = 'request' and c.created_by is distinct from me.user_id),
         o.id, o.username, o.display_name, o.avatar_path,
         lm.body, lm.sender_id = me.user_id, c.last_message_at,
         (select count(*)::int from public.messages m
           where m.conversation_id = c.id and m.sender_id is distinct from me.user_id
             and m.created_at > me.last_read_at)
  from public.conversation_participants me
  join public.conversations c on c.id = me.conversation_id
  join public.conversation_participants other_p
    on other_p.conversation_id = c.id and other_p.user_id <> me.user_id
  join public.profiles o on o.id = other_p.user_id
  cross join lateral (select private.hidden_before(me.user_id, c.id) as hidden_at) h
  left join lateral (
    select m.body, m.sender_id from public.messages m
    where m.conversation_id = c.id and m.created_at > h.hidden_at
    order by m.created_at desc limit 1
  ) lm on true
  where me.user_id = (select auth.uid())
    and c.status <> 'declined'
    and c.last_message_at is not null
    and c.last_message_at > h.hidden_at
    and not private.is_blocked_between(me.user_id, o.id)
    -- A request only appears for the recipient once it has a message.
  order by c.last_message_at desc;
$$;

-- -----------------------------------------------------------------------------
-- Reports keep a copy of the content as it was when reported, so editing or
-- deleting it afterwards does not hide it from the moderators.
-- -----------------------------------------------------------------------------
create table private.report_snapshots (
  report_id  uuid primary key references public.reports (id) on delete cascade,
  snapshot   jsonb,
  created_at timestamptz not null default now()
);
revoke all on private.report_snapshots from public, anon, authenticated;

create function private.snapshot_report()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into private.report_snapshots (report_id, snapshot)
  values (new.id, private.report_preview(new.target_type, new.target_id));
  return new;
end;
$$;
revoke execute on function private.snapshot_report() from public, anon, authenticated;
create trigger reports_snapshot after insert on public.reports
  for each row execute function private.snapshot_report();

drop function public.admin_reports_queue();
create function public.admin_reports_queue()
returns table (
  report_id         uuid,
  target_type       text,
  target_id         uuid,
  reason            text,
  details           text,
  created_at        timestamptz,
  reporter_username text,
  owner_id          uuid,
  owner_username    text,
  open_reports      integer,
  preview           jsonb,
  snapshot          jsonb
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'PL8_ADMIN_ONLY' using errcode = '42501';
  end if;
  return query
  select r.id, r.target_type::text, r.target_id, r.reason::text, r.details, r.created_at,
         rp.username, r.target_owner_id, op.username,
         (select count(*)::int from public.reports r2
           where r2.target_type = r.target_type and r2.target_id = r.target_id and r2.status = 'open'),
         private.report_preview(r.target_type, r.target_id),
         s.snapshot
  from public.reports r
  left join public.profiles rp on rp.id = r.reporter_id
  left join public.profiles op on op.id = r.target_owner_id
  left join private.report_snapshots s on s.report_id = r.id
  where r.status = 'open'
  order by r.created_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- Admins: suspended accounts (to lift a suspension in the app)
-- -----------------------------------------------------------------------------
create function public.admin_suspended_users()
returns table (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_path  text,
  suspended_at timestamptz,
  reason       text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'PL8_ADMIN_ONLY' using errcode = '42501';
  end if;
  return query
  select p.id, p.username, p.display_name, p.avatar_path, p.suspended_at,
         (select a.reason from private.admin_actions a
           where a.action = 'report_suspend' and a.metadata ->> 'owner_id' = p.id::text
           order by a.created_at desc limit 1)
  from public.profiles p
  where p.suspended_at is not null
  order by p.suspended_at desc;
end;
$$;

-- -----------------------------------------------------------------------------
-- Retention: as before, plus Apple / Google logins that never gave consent are
-- deleted after 7 days (no email address is kept without consent).
-- -----------------------------------------------------------------------------
create or replace function private.run_retention()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.notifications n
   where (n.read_at is not null and n.created_at < now() - interval '90 days')
      or n.created_at < now() - interval '180 days';
  delete from private.push_outbox o where o.created_at < now() - interval '7 days';
  delete from private.search_log l where l.created_at < now() - interval '30 days';
  delete from private.claim_log l where l.created_at < now() - interval '30 days';
  -- Unfinished drafts (upload interrupted)
  delete from public.posts p where p.published_at is null and p.created_at < now() - interval '1 day';
  update private.verification_requests r set status = 'expired'
   where r.status = 'awaiting_evidence' and r.created_at < now() - interval '7 days';
  -- Closed reports are kept one year as a record of moderation decisions.
  delete from public.reports r where r.status <> 'open' and r.handled_at < now() - interval '365 days';
  -- Social logins that never confirmed 18+ and the terms.
  delete from auth.users u
   where u.created_at < now() - interval '7 days'
     and coalesce(u.raw_app_meta_data ->> 'provider', '') in ('apple', 'google')
     and not exists (select 1 from private.user_consents c where c.user_id = u.id);
end;
$$;
revoke execute on function private.run_retention() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.my_consent()',
    'public.record_consent(boolean, text, text, text)',
    'public.hide_conversation(uuid)',
    'public.admin_reports_queue()',
    'public.admin_suspended_users()'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
