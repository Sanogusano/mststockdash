CREATE OR REPLACE VIEW public.v_ubicaciones_gestion AS
 SELECT l.location_id,
    l.name AS nombre,
    l.tipo_tienda,
    l.zona,
    l.dimension_m2,
    l.is_active AS location_activa,
    nlm.netsuite_location_name,
    nlm.netsuite_location_id AS codigo_oracle,
    nlm.tipo AS mapeo_tipo,
    nlm.notas AS mapeo_notas,
    sap.tier,
    sap.es_cedi,
    sap.es_outlet,
    sap.puede_ser_origen,
    sap.puede_ser_destino,
    sap.mod_default,
    sap.mod_por_categoria,
    sap.wos_objetivo_semanas,
    sap.wos_objetivo_por_categoria,
    sap.colchon_cedi_semanas,
    sap.capacidad_maxima_unidades,
    sap.activa AS allocation_activa,
    sap.updated_at AS params_updated_at,
        CASE
            WHEN sap.id IS NULL THEN 'sin_parametros'::text
            WHEN nlm.netsuite_location_id IS NULL AND nlm.tipo <> 'ignorar'::text THEN 'falta_codigo_oracle'::text
            WHEN sap.activa = false THEN 'inactiva'::text
            WHEN l.is_active = false THEN 'location_inactiva'::text
            ELSE 'ok'::text
        END AS estado_config,
    l.es_punto_venta
   FROM locations l
     LEFT JOIN netsuite_location_mapping nlm ON nlm.internal_location_id = l.location_id
     LEFT JOIN store_allocation_params sap ON sap.location_id = l.location_id
  ORDER BY (
        CASE sap.tier
            WHEN 'cedi'::text THEN 1
            WHEN 'flagship'::text THEN 2
            WHEN 'regular'::text THEN 3
            WHEN 'pequena'::text THEN 4
            WHEN 'outlet'::text THEN 5
            ELSE 6
        END), l.name;

CREATE OR REPLACE FUNCTION public.actualizar_ubicacion(p_location_id text, p_nombre text DEFAULT NULL::text, p_tipo_tienda text DEFAULT NULL::text, p_zona text DEFAULT NULL::text, p_dimension_m2 numeric DEFAULT NULL::numeric, p_is_active boolean DEFAULT NULL::boolean, p_netsuite_name text DEFAULT NULL::text, p_codigo_oracle integer DEFAULT NULL::integer, p_mapeo_tipo text DEFAULT NULL::text, p_mapeo_notas text DEFAULT NULL::text, p_tier text DEFAULT NULL::text, p_es_cedi boolean DEFAULT NULL::boolean, p_es_outlet boolean DEFAULT NULL::boolean, p_puede_origen boolean DEFAULT NULL::boolean, p_puede_destino boolean DEFAULT NULL::boolean, p_mod_default integer DEFAULT NULL::integer, p_wos_objetivo numeric DEFAULT NULL::numeric, p_colchon_cedi integer DEFAULT NULL::integer, p_capacidad_max integer DEFAULT NULL::integer, p_allocation_activa boolean DEFAULT NULL::boolean, p_mod_por_categoria jsonb DEFAULT NULL::jsonb, p_wos_objetivo_por_categoria jsonb DEFAULT NULL::jsonb, p_es_punto_venta boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existe boolean;
  v_dup    text;
BEGIN
  SELECT EXISTS(SELECT 1 FROM locations WHERE location_id = p_location_id) INTO v_existe;
  IF NOT v_existe THEN
    RAISE EXCEPTION 'La ubicación % no existe', p_location_id;
  END IF;

  IF p_netsuite_name IS NOT NULL AND TRIM(p_netsuite_name) <> '' THEN
    SELECT l.name INTO v_dup
    FROM netsuite_location_mapping m
    JOIN locations l ON l.location_id = m.internal_location_id
    WHERE m.netsuite_location_name = TRIM(p_netsuite_name)
      AND m.internal_location_id IS DISTINCT FROM p_location_id;
    IF v_dup IS NOT NULL THEN
      RAISE EXCEPTION 'La bodega «%» ya está asignada a %', TRIM(p_netsuite_name), v_dup;
    END IF;
  END IF;

  UPDATE locations SET
    name           = COALESCE(NULLIF(TRIM(p_nombre),''), name),
    tipo_tienda    = COALESCE(NULLIF(TRIM(p_tipo_tienda),''), tipo_tienda),
    zona           = COALESCE(NULLIF(TRIM(p_zona),''), zona),
    dimension_m2   = COALESCE(p_dimension_m2, dimension_m2),
    is_active      = COALESCE(p_is_active, is_active),
    es_punto_venta = COALESCE(p_es_punto_venta, es_punto_venta)
  WHERE location_id = p_location_id;

  IF p_netsuite_name IS NOT NULL OR p_codigo_oracle IS NOT NULL
     OR p_mapeo_tipo IS NOT NULL OR p_mapeo_notas IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM netsuite_location_mapping WHERE internal_location_id = p_location_id) THEN
      UPDATE netsuite_location_mapping SET
        netsuite_location_name = COALESCE(NULLIF(TRIM(p_netsuite_name),''), netsuite_location_name),
        netsuite_location_id   = COALESCE(p_codigo_oracle, netsuite_location_id),
        tipo                   = COALESCE(NULLIF(TRIM(p_mapeo_tipo),''), tipo),
        notas                  = COALESCE(p_mapeo_notas, notas)
      WHERE internal_location_id = p_location_id;
    ELSIF NULLIF(TRIM(p_netsuite_name),'') IS NOT NULL THEN
      INSERT INTO netsuite_location_mapping
        (netsuite_location_name, internal_location_id, netsuite_location_id, tipo, notas)
      VALUES (TRIM(p_netsuite_name), p_location_id, p_codigo_oracle,
              COALESCE(NULLIF(TRIM(p_mapeo_tipo),''),'tienda'), p_mapeo_notas);
    END IF;
  END IF;

  IF p_tier IS NOT NULL OR p_es_cedi IS NOT NULL OR p_es_outlet IS NOT NULL
     OR p_puede_origen IS NOT NULL OR p_puede_destino IS NOT NULL
     OR p_mod_default IS NOT NULL OR p_wos_objetivo IS NOT NULL
     OR p_colchon_cedi IS NOT NULL OR p_capacidad_max IS NOT NULL
     OR p_allocation_activa IS NOT NULL
     OR p_mod_por_categoria IS NOT NULL OR p_wos_objetivo_por_categoria IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM store_allocation_params WHERE location_id = p_location_id) THEN
      UPDATE store_allocation_params SET
        tier                       = COALESCE(NULLIF(TRIM(p_tier),''), tier),
        es_cedi                    = COALESCE(p_es_cedi, es_cedi),
        es_outlet                  = COALESCE(p_es_outlet, es_outlet),
        puede_ser_origen           = COALESCE(p_puede_origen, puede_ser_origen),
        puede_ser_destino          = COALESCE(p_puede_destino, puede_ser_destino),
        mod_default                = COALESCE(p_mod_default, mod_default),
        wos_objetivo_semanas       = COALESCE(p_wos_objetivo, wos_objetivo_semanas),
        colchon_cedi_semanas       = COALESCE(p_colchon_cedi, colchon_cedi_semanas),
        capacidad_maxima_unidades  = COALESCE(p_capacidad_max, capacidad_maxima_unidades),
        activa                     = COALESCE(p_allocation_activa, activa),
        mod_por_categoria          = COALESCE(p_mod_por_categoria, mod_por_categoria),
        wos_objetivo_por_categoria = COALESCE(p_wos_objetivo_por_categoria, wos_objetivo_por_categoria),
        updated_at                 = now()
      WHERE location_id = p_location_id;
    ELSE
      INSERT INTO store_allocation_params
        (location_id, tier, es_cedi, es_outlet, puede_ser_origen, puede_ser_destino,
         mod_default, wos_objetivo_semanas, colchon_cedi_semanas,
         capacidad_maxima_unidades, activa,
         mod_por_categoria, wos_objetivo_por_categoria, updated_at)
      VALUES (p_location_id, COALESCE(NULLIF(TRIM(p_tier),''),'regular'),
              COALESCE(p_es_cedi,false), COALESCE(p_es_outlet,false),
              COALESCE(p_puede_origen,true), COALESCE(p_puede_destino,true),
              p_mod_default, p_wos_objetivo, p_colchon_cedi,
              p_capacidad_max, COALESCE(p_allocation_activa,true),
              p_mod_por_categoria, p_wos_objetivo_por_categoria, now());
    END IF;
  END IF;

  RETURN (SELECT to_jsonb(v) FROM v_ubicaciones_gestion v WHERE v.location_id = p_location_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.crear_ubicacion_completa(p_location_id text, p_nombre text, p_tipo_tienda text, p_zona text DEFAULT NULL::text, p_netsuite_name text DEFAULT NULL::text, p_netsuite_code integer DEFAULT NULL::integer, p_capacidad integer DEFAULT NULL::integer, p_es_punto_venta boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_tipo_tienda NOT IN ('A', 'B', 'C', 'OUTLET', 'Online', 'Distribucion') THEN
    RAISE EXCEPTION 'tipo_tienda inválido: %. Debe ser A, B, C, OUTLET, Online o Distribucion', p_tipo_tienda;
  END IF;

  INSERT INTO locations (location_id, name, tipo_tienda, zona, is_active, es_punto_venta)
  VALUES (p_location_id, p_nombre, p_tipo_tienda, p_zona, true, COALESCE(p_es_punto_venta, true))
  ON CONFLICT (location_id) DO UPDATE SET
    name = EXCLUDED.name,
    tipo_tienda = EXCLUDED.tipo_tienda,
    zona = COALESCE(EXCLUDED.zona, locations.zona),
    es_punto_venta = EXCLUDED.es_punto_venta;

  IF p_netsuite_name IS NOT NULL THEN
    INSERT INTO netsuite_location_mapping (
      netsuite_location_name, netsuite_location_id,
      internal_location_id, tipo
    ) VALUES (
      p_netsuite_name, p_netsuite_code, p_location_id,
      CASE WHEN p_tipo_tienda = 'OUTLET' THEN 'solo_destino' ELSE 'origen_destino' END
    )
    ON CONFLICT (netsuite_location_name) DO UPDATE SET
      netsuite_location_id = EXCLUDED.netsuite_location_id,
      internal_location_id = EXCLUDED.internal_location_id,
      tipo = EXCLUDED.tipo;
  END IF;

  INSERT INTO store_allocation_params (
    location_id, tier, es_cedi, es_outlet,
    puede_ser_origen, puede_ser_destino,
    mod_default, wos_objetivo_semanas, capacidad_maxima_unidades,
    colchon_cedi_semanas, activa
  ) VALUES (
    p_location_id,
    CASE p_tipo_tienda
      WHEN 'A' THEN 'flagship'
      WHEN 'B' THEN 'regular'
      WHEN 'C' THEN 'pequena'
      WHEN 'OUTLET' THEN 'outlet'
      WHEN 'Online' THEN 'cedi'
      WHEN 'Distribucion' THEN 'cedi'
    END,
    (p_tipo_tienda IN ('Online', 'Distribucion')),
    (p_tipo_tienda = 'OUTLET'),
    (p_tipo_tienda <> 'OUTLET'),
    true,
    CASE p_tipo_tienda
      WHEN 'A' THEN 4 WHEN 'B' THEN 2 WHEN 'C' THEN 1
      WHEN 'OUTLET' THEN 1 ELSE 0
    END,
    CASE p_tipo_tienda
      WHEN 'A' THEN 6 WHEN 'B' THEN 4 WHEN 'C' THEN 3
      WHEN 'OUTLET' THEN 2 ELSE 8
    END,
    p_capacidad,
    8,
    true
  )
  ON CONFLICT (location_id) DO UPDATE SET
    tier = EXCLUDED.tier,
    es_cedi = EXCLUDED.es_cedi,
    es_outlet = EXCLUDED.es_outlet,
    puede_ser_origen = EXCLUDED.puede_ser_origen,
    mod_default = EXCLUDED.mod_default,
    wos_objetivo_semanas = EXCLUDED.wos_objetivo_semanas;

  RETURN p_location_id;
END;
$function$;