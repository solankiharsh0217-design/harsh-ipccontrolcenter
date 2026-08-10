while read table; do
  echo "Exporting $table..."
  psql "$VITE_SUPABASE_URL" -c "COPY (SELECT * FROM public.\"$table\") TO STDOUT WITH CSV HEADER" > "export/csv/$table.csv"
done < export/tables.txt
